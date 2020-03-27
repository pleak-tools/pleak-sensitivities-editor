import * as Viewer from 'bpmn-js/lib/NavigatedViewer';

import { ElementsHandler } from "./elements-handler";

declare let $: any;
declare let jexcel: any;
declare let CodeMirror: any;

declare function require(name:string);
let config = require('../../config.json');

let schemaCodeMirror;
let NRMCodeMirror;
let DBJexcel;

export class DataObjectHandler {

  constructor(elementsHandler: ElementsHandler, dataObject: any) {
    this.viewer = elementsHandler.viewer;
    this.registry = this.viewer.get('elementRegistry');
    this.canvas = this.viewer.get('canvas');
    this.overlays = this.viewer.get('overlays');

    this.elementsHandler = elementsHandler;
    this.dataObject = dataObject;

  }

  beingEdited: Boolean = false;

  viewer: Viewer;
  registry: any;
  canvas: any;
  overlays: any;

  elementsHandler: ElementsHandler;
  dataObject: any;

  dataObjectOptionsPanelContainer: any;

  DBInputInitialValue: any = null;

  getDataObjectId() {
    return this.dataObject.id;
  }

  getDataObjectInputSchema() {
    if (this.dataObject.sqlScript) {
      return this.dataObject.sqlScript;
    }

    let inputSchema = "";

    if (this.dataObject.sqlDataObjectInfo != null) {
      let savedData = JSON.parse(this.dataObject.sqlDataObjectInfo);
      inputSchema = savedData.inputSchema;
    }
    return inputSchema;
  }

  getDataObjectInputNRM() {
    let inputNRM = "";
    if (this.dataObject.sqlDataObjectInfo != null) {
      let savedData = JSON.parse(this.dataObject.sqlDataObjectInfo);
      inputNRM = savedData.inputNRM;
    }
    return inputNRM;
  }

  initDataObjectOptionsEditProcess() {
    this.loadDataObjectOptionsPanelTemplate();
  }

  areThereUnsavedDataObjectChanges() {
    if (this.getDataObjectInputSchema() != schemaCodeMirror.getValue() || this.getDataObjectInputNRM() != NRMCodeMirror.getValue() || this.DBInputInitialValue.toString() != $('#DBinputTable').jexcel('getData', false).toString()) {
      return true;
    } else {
      return false;
    }
  }

  checkForUnsavedDataObjectChangesBeforeTerminate() {
    if (this.areThereUnsavedDataObjectChanges()) {
      if (confirm('You have some unsaved changes. Would you like to revert these changes?')) {
        this.terminateDataObjectOptionsEditProcess();
      } else {
        this.canvas.addMarker(this.dataObject.id, 'selected');
        return false;
      }
    } else {
      this.terminateDataObjectOptionsEditProcess();
    }
  }

  terminateDataObjectOptionsEditProcess() {
    this.beingEdited = false;
    this.DBInputInitialValue = null;
    this.removeDataObjectHighlights();
    this.canvas.removeMarker(this.dataObject.id, 'selected');
    this.terminateDataObjectOptionsButtons();
    this.dataObjectOptionsPanelContainer.hide();
  }

  initDataObjectOptionsPanel() {
    let self = this;
    this.beingEdited = true;
    this.dataObjectOptionsPanelContainer = $('#data-object-options-panel');

    let dataObjectName = "undefined";
    if (this.dataObject.name) {
      dataObjectName = this.dataObject.name;
    }
    this.dataObjectOptionsPanelContainer.find('.data-object-name').text(dataObjectName);

    if (!this.elementsHandler.canEdit) {
      this.dataObjectOptionsPanelContainer.find('.panel-footer').hide();
    }

    let savedData;
    let inputNRM = "";
    let inputDB = [];
    let inputSchema = this.getDataObjectInputSchema();
    if (this.dataObject.sqlDataObjectInfo != null) {
      savedData = JSON.parse(this.dataObject.sqlDataObjectInfo);
      inputNRM = savedData.inputNRM;
      inputDB = savedData.inputDB;
    }

    $('.task-options-panel, .data-object-options-panel').find('.CodeMirror').remove();
    this.dataObjectOptionsPanelContainer.find('#data-object-schemaInput').val(inputSchema);
    schemaCodeMirror = CodeMirror.fromTextArea(document.getElementById("data-object-schemaInput"), {
      mode: "text/x-mysql",
      readOnly: !this.elementsHandler.canEdit,
      lineNumbers: false,
      showCursorWhenSelecting: true,
      lineWiseCopyCut: false
    });
    if (inputSchema == null) {
      inputSchema = "";
    }
    schemaCodeMirror.setValue(inputSchema);

    this.dataObjectOptionsPanelContainer.find('#data-object-NRMinput').val(inputNRM);
    NRMCodeMirror = CodeMirror.fromTextArea(document.getElementById("data-object-NRMinput"), {
      readOnly: !this.elementsHandler.canEdit,
      lineNumbers: false,
      showCursorWhenSelecting: true,
      lineWiseCopyCut: false
    });
    NRMCodeMirror.setValue(inputNRM);

    $('.jexcel').remove();
    DBJexcel = null;
    DBJexcel = this.dataObjectOptionsPanelContainer.find('#DBinputTable');
    DBJexcel.jexcel({
      data: inputDB,
      minDimensions: [10,7],
      editable: this.elementsHandler.canEdit,
      onselection: function() {
        setTimeout(function() {
          $("#jexcel_contextmenu a:last-child").hide();
        }, 1);
      }
    });

    this.DBInputInitialValue = $('#DBinputTable').jexcel('getData', false);

    setTimeout(function() {
      NRMCodeMirror.refresh();
      schemaCodeMirror.refresh();
    }, 10);

    this.highlightDataObject();
    this.canvas.addMarker(this.dataObject.id, 'selected');

    this.initDataObjectOptionsButtons();
    let optionsPanel = this.dataObjectOptionsPanelContainer;
    optionsPanel.detach();
    $('#sidebar .divider').after(optionsPanel);
    $('#sidebar').scrollTop(0);
    this.dataObjectOptionsPanelContainer.show();

  }

  getPreparedQueries() {
    let savedData;
    let inputSchema = this.getDataObjectInputSchema();
    let inputNRM, inputDB = "";
    if (this.dataObject.sqlDataObjectInfo != null) {
      savedData = JSON.parse(this.dataObject.sqlDataObjectInfo);
      inputNRM = savedData.inputNRM;
      inputDB = savedData.inputDB;
    }
    if (inputNRM && inputDB) {
      let NRMOutput = inputNRM;
      let DBOutput = "";
      let schemaOutput = inputSchema;
      for (let row of inputDB) {
        for (let col of row) {
          DBOutput += col + " ";
        }
        DBOutput = DBOutput + "\n";
      }
      DBOutput = DBOutput.trim();
      let name = this.dataObject.name.trim().replace(/ *\([^)]*\) */g, "").replace(/\s+/g, "_");

      return {id: this.dataObject.id, name: name, nrm: NRMOutput, db: DBOutput, schema: schemaOutput};
    }
  }

  loadDataObjectOptionsPanelTemplate() {
    if ($('#input-options').has('#data-object-options-panel').length) {
      this.initDataObjectOptionsPanel();
    } else {
      $('#input-options').prepend($('<div>').load(config.frontend.host + '/' + config.sql_sensitivities_editor.folder + '/src/app/editor/templates/data-object-options-panel.html', () => {
        this.initDataObjectOptionsPanel();
      }));
    }
  }

  initDataObjectOptionsButtons() {
    this.terminateDataObjectOptionsButtons();
    this.dataObjectOptionsPanelContainer.one('click', '#data-object-options-save-button', (e) => {
      this.saveDataObjectOptions();
    });
    this.dataObjectOptionsPanelContainer.on('click', '#data-object-options-hide-button', (e) => {
      this.checkForUnsavedDataObjectChangesBeforeTerminate();
    });
  }

  terminateDataObjectOptionsButtons() {
    this.dataObjectOptionsPanelContainer.off('click', '#data-object-options-save-button');
    this.dataObjectOptionsPanelContainer.off('click', '#data-object-options-hide-button');
  }

  updateDataObjectOptions() {
    let inputSchema = schemaCodeMirror.getValue();
    let inputNRM = NRMCodeMirror.getValue();
    let inputDB = $('#DBinputTable').jexcel('getData', false);
    let cleanedInputDB = [];
    for (let row of inputDB) {
      let cleanedRow = [];
      for (let cell of row) {
        if (cell.length > 0) {
          cleanedRow.push(cell.trim());
        }
      }
      if (cleanedRow.length > 0) {
        cleanedInputDB.push(cleanedRow);
      }
    }
    let object = {inputNRM: inputNRM, inputDB: cleanedInputDB, inputSchema: inputSchema};
    this.dataObject.sqlScript = inputSchema;
    this.dataObject.sqlDataObjectInfo = JSON.stringify(object);
  }

  saveDataObjectOptions() {
    this.updateDataObjectOptions();
    this.terminateDataObjectOptionsEditProcess();
    this.setNewModelContentVariableContent();
  }

  removeDataObjectOptions() {
    this.terminateDataObjectOptionsEditProcess();
    delete this.dataObject.sqlDataObjectInfo;
    this.setNewModelContentVariableContent();
  }

  highlightDataObject() {
    this.canvas.addMarker(this.dataObject.id, 'highlight-data-object');
  }

  removeDataObjectHighlights() {
    this.canvas.removeMarker(this.dataObject.id, 'highlight-data-object');
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

  /** Wrappers to access elementsHandler functions*/

  updateModelContentVariable(xml: String) {
    this.elementsHandler.updateModelContentVariable(xml);
  }

}
