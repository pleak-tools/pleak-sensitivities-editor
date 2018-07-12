import * as Viewer from 'bpmn-js/lib/NavigatedViewer';

import { ElementsHandler } from "./elements-handler";

declare let $: any;
declare let jexcel: any;
declare let CodeMirror: any;
let is = (element, type) => element.$instanceOf(type);

declare function require(name:string);
let config = require('../../config.json');

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

  schemaCodeMirror: any;
  NRMCodeMirror: any;
  DBJexcel: any;

  getDataObjectId() {
    return this.dataObject.id;
  }

  initDataObjectOptionsEditProcess() {
    this.loadDataObjectOptionsPanelTemplate();
  }

  terminateDataObjectOptionsEditProcess() {
    this.beingEdited = false;

    this.removeDataObjectHighlights();

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
    let inputDB = "";
    let inputSchema = "";
    if (this.dataObject.sqlDataObjectInfo != null) {
      savedData = JSON.parse(this.dataObject.sqlDataObjectInfo);
      inputSchema = savedData.inputSchema;
      inputNRM = savedData.inputNRM;
      inputDB = savedData.inputDB;
    }

    $('.CodeMirror').remove();

    this.dataObjectOptionsPanelContainer.find('#data-object-schemaInput').val(inputSchema);
    this.schemaCodeMirror = CodeMirror.fromTextArea(document.getElementById("data-object-schemaInput"), {
      mode: "text/x-mysql",
      readOnly: !this.elementsHandler.canEdit,
      lineNumbers: false,
      showCursorWhenSelecting: true,
      lineWiseCopyCut: false
    });
    if (inputSchema == null) {
      inputSchema = "";
    }
    this.schemaCodeMirror.setValue(inputSchema);

    this.dataObjectOptionsPanelContainer.find('#data-object-NRMinput').val(inputNRM);
    this.NRMCodeMirror = CodeMirror.fromTextArea(document.getElementById("data-object-NRMinput"), {
      readOnly: !this.elementsHandler.canEdit,
      lineNumbers: false,
      showCursorWhenSelecting: true,
      lineWiseCopyCut: false
    });
    this.NRMCodeMirror.setValue(inputNRM);

    $('.jexcel').remove();
    this.DBJexcel = null;
    this.DBJexcel = this.dataObjectOptionsPanelContainer.find('#DBinputTable');
    this.DBJexcel.jexcel({
      data: inputDB,
      minDimensions: [10,7],
      editable: this.elementsHandler.canEdit,
      onselection: function() {
        setTimeout(function() {
          $("#jexcel_contextmenu a:last-child").hide();
        }, 1);
      }
    });

    setTimeout(function() {
      self.NRMCodeMirror.refresh();
      self.schemaCodeMirror.refresh();
    }, 10);

    this.highlightDataObject();

    this.initDataObjectOptionsButtons();
    let optionsPanel = this.dataObjectOptionsPanelContainer;
    optionsPanel.detach();
    $('#sidebar').prepend(optionsPanel);
    $('#sidebar').scrollTop(0);
    this.dataObjectOptionsPanelContainer.show();

  }

  getPreparedQueries() {
    let savedData;
    let inputSchema, inputNRM, inputDB = "";
    if (this.dataObject.sqlDataObjectInfo != null) {
      savedData = JSON.parse(this.dataObject.sqlDataObjectInfo);
      inputSchema = savedData.inputSchema;
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
      $('#input-options').prepend($('<div>').load(config.frontend.host + '/' + config.sql_derivative_sensitivity_editor.folder + '/src/app/editor/templates/data-object-options-panel.html', () => {
        this.initDataObjectOptionsPanel();
      }));
    }
  }

  initDataObjectOptionsButtons() {
    this.terminateDataObjectOptionsButtons();
    this.dataObjectOptionsPanelContainer.one('click', '#data-object-options-save-button', (e) => {
      this.saveDataObjectOptions();
    });
    this.dataObjectOptionsPanelContainer.one('click', '#data-object-options-remove-button', (e) => {
      this.removeDataObjectOptions();
    });
    this.dataObjectOptionsPanelContainer.one('click', '#data-object-options-hide-button', (e) => {
      this.terminateDataObjectOptionsEditProcess();
    });
  }

  terminateDataObjectOptionsButtons() {
    this.dataObjectOptionsPanelContainer.off('click', '#data-object-options-save-button');
    this.dataObjectOptionsPanelContainer.off('click', '#data-object-options-remove-button');
    this.dataObjectOptionsPanelContainer.off('click', '#data-object-options-hide-button');
  }

  updateDataObjectOptions() {
    let inputSchema = this.schemaCodeMirror.getValue();
    let inputNRM = this.NRMCodeMirror.getValue();
    let inputDB = $('#DBinputTable').jexcel('getData', false);
    let object = {inputNRM: inputNRM, inputDB: inputDB, inputSchema: inputSchema};
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