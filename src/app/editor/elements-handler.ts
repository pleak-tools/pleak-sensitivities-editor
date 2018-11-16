import * as Viewer from 'bpmn-js/lib/NavigatedViewer';

import { AnalysisHandler } from './analysis-handler';
import { TaskHandler } from "./task-handler";
import { DataObjectHandler } from "./data-object-handler";
import { AttackerSettingsHandler } from './attacker-settings-handler';

declare let $: any;
let is = (element, type) => element.$instanceOf(type);

export class ElementsHandler {

  constructor(viewer: Viewer, diagram: String, pg_parser, parent: any, canEdit: Boolean) {
    this.viewer = viewer;
    this.eventBus = this.viewer.get('eventBus');
    this.canvas = this.viewer.get('canvas');
    this.diagram = diagram;
    this.pg_parser = pg_parser;
    this.parent = parent;
    this.canEdit = canEdit;
    this.init();
  }

  viewer: Viewer;
  eventBus: any;
  canvas: any;
  diagram: String;
  pg_parser: any;
  parent: any;
  canEdit: Boolean;

  analysisHandler: AnalysisHandler;

  taskHandlers: TaskHandler[] = [];
  dataObjectHandlers: DataObjectHandler[] = [];

  attackerSettingsHandler: AttackerSettingsHandler;

  init() {
    // Import model from xml file
    this.viewer.importXML(this.diagram, () => {
      this.viewer.get("moddle").fromXML(this.diagram, (err:any, definitions:any) => {
        if (typeof definitions !== 'undefined') {
          // Add stereotype labels to elements based on xml labels
          this.viewer.importDefinitions(definitions, () => this.createElementHandlerInstances(definitions));
        }
      });
      // Add click event listener to init and terminate stereotype processes
      this.eventBus.on('element.click', (e) => {

        if (is(e.element.businessObject, 'bpmn:Task') || (is(e.element.businessObject, 'bpmn:DataObjectReference') && e.element.incoming.length === 0)) {
          this.canvas.removeMarker(e.element.id, 'selected');
          let beingEditedElementHandler = this.taskHandlers.filter(function( obj ) {
            return obj.task != e.element.businessObject && obj.beingEdited;
          });
          if (beingEditedElementHandler.length > 0) {
            beingEditedElementHandler[0].checkForUnsavedTaskChangesBeforeTerminate();
          }

          let beingEditedDataObjectHandler = this.dataObjectHandlers.filter(function( obj ) {
            return obj.dataObject != e.element.businessObject && obj.beingEdited;
          });
          if (beingEditedDataObjectHandler.length > 0) {
            beingEditedDataObjectHandler[0].checkForUnsavedDataObjectChangesBeforeTerminate();
          }
        }

        let toBeEditedelementHandler = [];
        if (!this.isAnotherTaskOrDataObjectBeingEdited(e.element.id)) {
          if (is(e.element.businessObject, 'bpmn:Task')) {
            toBeEditedelementHandler = this.taskHandlers.filter(function( obj ) {
              return obj.task == e.element.businessObject && obj.beingEdited == false;
            });
            if (toBeEditedelementHandler.length > 0) {
              toBeEditedelementHandler[0].initTaskOptionsEditProcess();
            }
          } else if (is(e.element.businessObject, 'bpmn:DataObjectReference') && e.element.incoming.length === 0) {
            toBeEditedelementHandler = this.dataObjectHandlers.filter(function( obj ) {
              return obj.dataObject == e.element.businessObject && obj.beingEdited == false;
            });
            if (toBeEditedelementHandler.length > 0) {
              toBeEditedelementHandler[0].initDataObjectOptionsEditProcess();
            }
          }
        }

      });
    });
    this.analysisHandler = new AnalysisHandler(this.viewer, this.diagram, this);
    this.attackerSettingsHandler = new AttackerSettingsHandler(this.viewer, this.diagram, this);
    this.prepareParser();
  }

  // Check if another element (compared to the input id) is being currently edited
  isAnotherTaskOrDataObjectBeingEdited(elementId: string) {
    let beingEditedElementHandler = this.taskHandlers.filter(function( obj ) {
      return obj.beingEdited;
    });
    let beingEditedDataObjectHandler = this.dataObjectHandlers.filter(function( obj ) {
      return obj.beingEdited;
    });
    if ((beingEditedElementHandler.length > 0 && beingEditedElementHandler[0].task.id !== elementId) || (beingEditedDataObjectHandler.length > 0 && beingEditedDataObjectHandler[0].dataObject.id !== elementId)) {
      return true;
    }
    return false;
  }

  // Create handler instance for each task / messageFlow of model
  createElementHandlerInstances(definitions: any) {
    for (let diagram of definitions.diagrams) {
      let element = diagram.plane.bpmnElement;
      if (element.$type === "bpmn:Process") {
        if (element.flowElements) {
          for (let node of element.flowElements.filter((e:any) => is(e, "bpmn:Task"))) {
            this.taskHandlers.push(new TaskHandler(this, node));
          }
          for (let node of element.flowElements.filter((e:any) => is(e, "bpmn:DataObjectReference"))) {
            this.dataObjectHandlers.push(new DataObjectHandler(this, node));
          }
        }
      } else {
        for (let participant of element.participants) {
          if (participant.processRef && participant.processRef.flowElements) {
            for (let node of participant.processRef.flowElements.filter((e:any) => is(e, "bpmn:Task"))) {
              this.taskHandlers.push(new TaskHandler(this, node));
            }
            for (let sprocess of participant.processRef.flowElements.filter((e:any) => is(e, "bpmn:SubProcess"))) {
              if (sprocess.flowElements) {
                for (let node of sprocess.flowElements.filter((e:any) => is(e, "bpmn:Task"))) {
                  this.taskHandlers.push(new TaskHandler(this, node));
                }
              }
            }
            for (let node of participant.processRef.flowElements.filter((e:any) => is(e, "bpmn:DataObjectReference"))) {
              this.dataObjectHandlers.push(new DataObjectHandler(this, node));
            }
          }
        }
      }
    }
  }

  prepareParser() {
    let self = this;
    return new Promise(() => {
      let result = this.pg_parser.parse("");
      if (!result.parse_tree.length) {
        self.parent.loaded = true;
      }
    });
  }

  initAnalyzeProcess() {
    this.analysisHandler.init();
  }

  terminateAnalyzeProcess() {
    this.analysisHandler.removeErrorHiglights();
  }

  updateModelContentVariable(xml: String) {
    this.parent.newChanges = true;
    this.parent.updateModelContentVariable(xml);
    $('#analysis-results-panel-content').html('');
    $('#analysis-results-panel').hide();
  }

  // Get taskHandler instance of task by task id
  getTaskHandlerByTaskId(taskId: String) {
    let taskHandler = null;
    let taskHandlerWithTaskId = this.getAllModelTaskHandlers().filter(function( obj ) {
      return obj.task.id == taskId;
    });
    if (taskHandlerWithTaskId.length > 0) {
      taskHandler = taskHandlerWithTaskId[0];
    }
    return taskHandler;
  }

  // Get taskHandler instance of task by task name
  getTaskHandlerByPreparedTaskName(name: String) {
    let taskHandler = null;
    let taskHandlerWithTaskId = this.getAllModelTaskHandlers().filter(function( obj ) {
      return obj.task.name.trim().replace(/\s+/g, "_") == name;
    });
    if (taskHandlerWithTaskId.length > 0) {
      taskHandler = taskHandlerWithTaskId[0];
    }
    return taskHandler;
  }

  // Get all taskHandler instances of the model
  getAllModelTaskHandlers() {
    return this.taskHandlers;
  }

  // Get dataObjectHandler instance of dataObject by dataObject id
  getDataObjectHandlerByDataObjectId(dataObjectId: String) {
    let dataObjectHandler = null;
    let dataObjectHandlerWithMessageFlowId = this.getAllModelDataObjectHandlers().filter(function( obj ) {
      return obj.dataObject.id == dataObjectId;
    });
    if (dataObjectHandlerWithMessageFlowId.length > 0) {
      dataObjectHandler = dataObjectHandlerWithMessageFlowId[0];
    }
    return dataObjectHandler;
  }

  // Get dataObjectHandler instance of dataObject by dataObject formatted name
  getDataObjectHandlerByPreparedDataObjectName(name: String) {
    let dataObjectHandler = null;
    let dataObjectHandlerWithMessageFlowId = this.getAllModelDataObjectHandlers().filter(function( obj ) {
      return obj.dataObject.name.trim().replace(/ *\([^)]*\) */g, "").replace(/\s+/g, "_") == name;
    });
    if (dataObjectHandlerWithMessageFlowId.length > 0) {
      dataObjectHandler = dataObjectHandlerWithMessageFlowId[0];
    }
    return dataObjectHandler;
  }

  // Get all dataObjectHandler instances of the model
  getAllModelDataObjectHandlers() {
    return this.dataObjectHandlers;
  }

  // Check for unsaved changes on model
  areThereUnsavedChangesOnModel() {
    if (this.attackerSettingsHandler.areThereUnsavedChanges()) {
      return true;
    }
    let beingEditedElementHandler = this.taskHandlers.filter(function( obj ) {
      return obj.beingEdited;
    });
    let beingEditedDataObjectHandler = this.dataObjectHandlers.filter(function( obj ) {
      return obj.beingEdited;
    });
    if (beingEditedElementHandler.length > 0) {
      if (beingEditedElementHandler[0].areThereUnsavedTaskChanges()) {
        return true;
      }

    }
    if (beingEditedDataObjectHandler.length > 0) {
      if (beingEditedDataObjectHandler[0].areThereUnsavedDataObjectChanges()) {
        return true;
      }
    }
  }

}