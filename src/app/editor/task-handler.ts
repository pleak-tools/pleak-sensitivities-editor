import * as Viewer from 'bpmn-js/lib/NavigatedViewer';

import { ElementsHandler } from "./elements-handler";

declare let $: any;
declare let CodeMirror: any;
let is = (element, type) => element.$instanceOf(type);

declare function require(name:string);
let config = require('../../config.json');

let codeMirror1;

export class TaskHandler {

  constructor(elementsHandler: ElementsHandler, task: any) {
    this.viewer = elementsHandler.viewer;
    this.registry = this.viewer.get('elementRegistry');
    this.canvas = this.viewer.get('canvas');
    this.overlays = this.viewer.get('overlays');

    this.elementsHandler = elementsHandler;
    this.task = task;

    this.init();
  }

  beingEdited: Boolean = false;

  viewer: Viewer;
  registry: any;
  canvas: any;
  overlays: any;

  elementsHandler: ElementsHandler;
  task: any;

  taskOptionsPanelContainer: any;

  getTaskId() {
    return this.task.id;
  }

  init() {
  }

  initTaskOptionsEditProcess() {
    this.loadTaskOptionsPanelTemplate();
  }

  terminateTaskOptionsEditProcess() {
    this.beingEdited = false;
    this.taskOptionsPanelContainer.find('#task-input1').val('');
    this.removeTaskInputsOutputsHighlights();
    this.terminateTaskOptionsButtons();
    this.taskOptionsPanelContainer.hide();
  }

  initTaskOptionsPanel() {
    this.beingEdited = true;
    this.taskOptionsPanelContainer = $('#task-options-panel');

    let taskName = "undefined";
    if (this.task.name) {
      taskName = this.task.name;
    }
    this.taskOptionsPanelContainer.find('.task-name').text(taskName);
    
    let savedData;
    let input1 = "";
    if (this.task.sqlTaskInfo != null) {
      savedData = JSON.parse(this.task.sqlTaskInfo);
      input1 = savedData.input1;
    }
    this.taskOptionsPanelContainer.find('#task-input1').val(input1);

    $('.CodeMirror').remove();
    codeMirror1 = CodeMirror.fromTextArea(document.getElementById("task-input1"), {
      //mode: "text/x-sql, text/x-mysql, text/x-mariadb, text/x-cassandra, text/x-plsql, text/x-mssql, text/x-hive, text/x-pgsql, text/x-gql, text/x-gpsql, text/x-esper",
      mode: "text/x-mysql",
      lineNumbers: true,
      showCursorWhenSelecting: true
    });
    setTimeout(function() {
      codeMirror1.refresh();
     }, 10);

     this.highlightTaskInputAndOutputObjects();

    this.initTaskOptionsButtons();
    let optionsPanel = this.taskOptionsPanelContainer;
    optionsPanel.detach();
    $('#sidebar').prepend(optionsPanel);
    $('#sidebar').scrollTop(0);
    this.taskOptionsPanelContainer.show();

  }

  getPreparedQuery() {
    let savedData: any = "";
    let input = "";
    if (this.task.sqlTaskInfo != null) {
      savedData = JSON.parse(this.task.sqlTaskInfo);
      input = savedData.input1;
    }
    if (input) {
      let result = this.elementsHandler.pg_parser.parse(input);
      if (result.parse_tree.length) {
        if (result.parse_tree[0].CreateFunctionStmt) {
          let stprocBody = result.parse_tree[0].CreateFunctionStmt.options[0].DefElem.arg[0].String.str;
          let obj_query = stprocBody.trim().replace(/\s+/g, " ");
          let innerResult = this.elementsHandler.pg_parser.parse(obj_query);
          if (innerResult.parse_tree.length) {
            return {success: {id: this.task.id, taskName: this.task.name.trim().replace(/\s+/g, "_"), query: obj_query}};
          } else {
            return {error: innerResult.error.message};
          }
        } else {
          return {error: result.error.message};
        }
      } else {
        return {error: result.error.message};
      }
    } else {
      return {error: "Stored procedure not found"};
    }
  }

  loadTaskOptionsPanelTemplate() {
    if ($('#input-options').has('#task-options-panel').length) {
      this.initTaskOptionsPanel();
    } else {
      $('#input-options').prepend($('<div>').load(config.frontend.host + '/' + config.sql_derivative_sensitivity_editor.folder + '/src/app/editor/templates/task-options-panel.html', () => {
        this.initTaskOptionsPanel();
      }));
    }
  }

  initTaskOptionsButtons() {
    this.terminateTaskOptionsButtons();
    this.taskOptionsPanelContainer.one('click', '#task-options-save-button', (e) => {
      this.saveTaskOptions();
    });
    this.taskOptionsPanelContainer.one('click', '#task-options-remove-button', (e) => {
      this.removeTaskOptions();
    });
    this.taskOptionsPanelContainer.one('click', '#task-options-hide-button', (e) => {
      this.terminateTaskOptionsEditProcess();
    });
  }

  terminateTaskOptionsButtons() {
    this.taskOptionsPanelContainer.off('click', '#task-options-save-button');
    this.taskOptionsPanelContainer.off('click', '#task-options-remove-button');
    this.taskOptionsPanelContainer.off('click', '#task-options-hide-button');
  }

  updateTaskOptions() {
    let infoObj = {input1: codeMirror1.getValue()};
    this.task.sqlTaskInfo = JSON.stringify(infoObj);
  }

  saveTaskOptions() {
    this.updateTaskOptions();
    this.terminateTaskOptionsEditProcess();
    this.setNewModelContentVariableContent();
    this.canvas.removeMarker(this.task.id, 'highlight-general-error');
  }
  
  removeTaskOptions() {
    this.terminateTaskOptionsEditProcess();
    delete this.task.sqlTaskInfo;
    this.setNewModelContentVariableContent();
  }

  setNewModelContentVariableContent() {
    this.viewer.saveXML(
      {
        format: true
      },
      (err: any, xml: string) => {
        this.updateModelContentVariable(xml);
      }
    );
  }

  // Highlight inputs and outputs of the task
  highlightTaskInputAndOutputObjects() {
    let taskInputOutputObjects = this.getTaskInputOutputObjects();
    for (let inputOutputObj of taskInputOutputObjects) {
      this.canvas.addMarker(inputOutputObj.id, 'highlight-input-output-selected');
    }
    for (let inputObject of this.getTaskInputObjects()) {
      if (taskInputOutputObjects.indexOf(inputObject) === -1) {
        this.canvas.addMarker(inputObject.id, 'highlight-input-selected');
      }
    }
    for (let outputObj of this.getTaskOutputObjects()) {
      if (taskInputOutputObjects.indexOf(outputObj) === -1) {
        this.canvas.addMarker(outputObj.id, 'highlight-output-selected');
      }
    }
    this.canvas.addMarker(this.task.id, 'highlight-task');
  }

  // Remove highlighting of task inputs and outputs
  removeTaskInputsOutputsHighlights() {
    for (let inputOutputObj of this.getTaskInputOutputObjects()) {
      this.canvas.removeMarker(inputOutputObj.id, 'highlight-input-output-selected');
    }
    for (let inputObj of this.getTaskInputObjects()) {
      this.canvas.removeMarker(inputObj.id, 'highlight-input-selected');
    }
    for (let outputObj of this.getTaskOutputObjects()) {
      this.canvas.removeMarker(outputObj.id, 'highlight-output-selected');
    }
    this.canvas.removeMarker(this.task.id, 'highlight-task');
  }

  // Return all input elements of the task
  getTaskInputObjects() {
    let objects = [];
    if (this.task.id != null) {
      let task = this.registry.get(this.task.id).businessObject;
      if (task.dataInputAssociations) {
        for (let i = 0; i < task.dataInputAssociations.length; i++) {
          if (task.dataInputAssociations[i].sourceRef) {
            objects.push(this.registry.get(task.dataInputAssociations[i].sourceRef[0].id));
          }
        }
      }
    }
    return objects;
  }

  // Return all output elements of the task
  getTaskOutputObjects() {
    let objects = [];
    if (this.task.id != null) {
      let task = this.registry.get(this.task.id).businessObject;
      if (task.dataOutputAssociations) {
        for (let i = 0; i < task.dataOutputAssociations.length; i++) {
          if (task.dataOutputAssociations[i].targetRef) {
            objects.push(this.registry.get(task.dataOutputAssociations[i].targetRef.id));
          }
        }
      }
    }
    return objects;
  }

  // Return all elements that are inputs and outputs at the same time of the task
  getTaskInputOutputObjects() {
    let objects = [];
    if (this.task.id != null) {
      let allInputsOutputs = [];
      let allInputs = [];
      let allOutputs = [];
      for (let inputObj of this.getTaskInputObjects()) {
        allInputsOutputs.push(inputObj);
        allInputs.push(inputObj);
      }
      for (let outputObj of this.getTaskOutputObjects()) {
        allInputsOutputs.push(outputObj);
        allOutputs.push(outputObj);
      }
      for (let obj of allInputsOutputs) {
        if (allInputs.indexOf(obj) !== -1 && allOutputs.indexOf(obj) !== -1 && objects.indexOf(obj) === -1) {
           objects.push(obj);
        }
      }
    }
    return objects;
  }

  /** Wrappers to access elementsHandler functions*/

  updateModelContentVariable(xml: String) {
    this.elementsHandler.updateModelContentVariable(xml);
  }

}
