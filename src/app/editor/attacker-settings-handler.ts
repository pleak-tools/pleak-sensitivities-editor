import * as Viewer from 'bpmn-js/lib/NavigatedViewer';

declare let $: any;
declare let CodeMirror: any;

declare function require(name:string);
let config = require('../../config.json');

let attackerKnowledgeCodeMirror;

export class AttackerSettingsHandler {

  constructor(viewer: Viewer, diagram: String, parent: any) {
    this.viewer = viewer;
    this.eventBus = this.viewer.get('eventBus');
    this.registry = this.viewer.get('elementRegistry');
    this.canvas = this.viewer.get('canvas');
    this.overlays = this.viewer.get('overlays');
    this.diagram = diagram;
    this.elementsHandler = parent;
    this.editor = parent.parent;
  }
    
  viewer: Viewer;
  eventBus: any;
  registry: any;
  canvas: any;
  overlays: any;
  diagram: String;
    
  editor: any;
  elementsHandler: any;

  attackerSettingsPanelContainer: any;

  getSavedAttackerSettings() {
    let root = this.registry.get('Process_1');
    let attackerPriorKnowledge = "";
    if (root && root.businessObject && root.businessObject.policyInfo != null) {
      return attackerPriorKnowledge = JSON.parse(root.businessObject.policyInfo).attackerKnowledge;
    } else {
      return null;
    }
  }

  getCurrentAttackerSettings() {
    return attackerKnowledgeCodeMirror.getValue();
  }

  getAttackerSettings() {
    if (this.areAttackerSettingsLoaded()) {
      return this.getCurrentAttackerSettings();
    } else {
      return this.getSavedAttackerSettings();
    }
  }

  initAttackerSettingsEditProcess() {
    if (!$('#attacker-settings-panel').is(":visible")) {
      this.loadAttackerSettingsPanelTemplate();
    }
  }

  loadAttackerSettingsPanelTemplate() {
    if ($('#sidebar').has('#attacker-settings-panel').length) {
      this.initAttackerSettingsPanel();
    } else {
      $('#sidebar').append($('<div>').load(config.frontend.host + '/' + config.guessing_advantage_editor.folder + '/src/app/editor/templates/attacker-settings-panel.html', () => {
        this.initAttackerSettingsPanel();
      }));
    }
  }

  initAttackerSettingsPanel() {
    this.attackerSettingsPanelContainer = $('#attacker-settings-panel');
    if (!this.elementsHandler.canEdit) {
      this.attackerSettingsPanelContainer.find('#attacker-settings-save-button').hide();
    }
    $('#attacker-settings-panel').find('.CodeMirror').remove();

    let attackerPriorKnowledge = this.getSavedAttackerSettings();
    this.attackerSettingsPanelContainer.find('#attacker-prior-knowledge').val(attackerPriorKnowledge);
    attackerKnowledgeCodeMirror = CodeMirror.fromTextArea(document.getElementById("attacker-prior-knowledge"), {
      mode: "text/x-mysql",
      readOnly: !this.elementsHandler.canEdit,
      lineNumbers: false,
      showCursorWhenSelecting: true,
      lineWiseCopyCut: false
    });
    if (attackerPriorKnowledge == null) {
      attackerPriorKnowledge = "";
    }
    attackerKnowledgeCodeMirror.setValue(attackerPriorKnowledge);
    setTimeout(function() {
      attackerKnowledgeCodeMirror.refresh();
    }, 10);
    this.initAttackerSettingsButtons();
    $('#attacker-settings-button').prop('disabled', true);
    this.attackerSettingsPanelContainer.show();
  }

  terminateAttackerSettingsPanel() {
    this.terminateAttackerSettingsOptionsButtons();
    $('#attacker-settings-button').prop('disabled', false);
    this.attackerSettingsPanelContainer.hide();
  }

  initAttackerSettingsButtons() {
    this.terminateAttackerSettingsOptionsButtons();
    this.attackerSettingsPanelContainer.one('click', '#attacker-settings-save-button', (e) => {
      this.saveAttackerSettings();
    });
    this.attackerSettingsPanelContainer.on('click', '#attacker-settings-hide-button', (e) => {
      this.checkForUnsavedAttackerSettingsChangesBeforeTerminate();
    });
  }

  terminateAttackerSettingsOptionsButtons() {
    this.attackerSettingsPanelContainer.off('click', '#attacker-settings-save-button');
    this.attackerSettingsPanelContainer.off('click', '#attacker-settings-hide-button');
  }

  updateAttackerSettings() {
    let attackerKnowledge = attackerKnowledgeCodeMirror.getValue();
    let sensitiveAttributes = "";
    let root = this.registry.get('Process_1');
    if (root && root.businessObject) {
      if (root.businessObject.policyInfo != null) {
        sensitiveAttributes = JSON.parse(root.businessObject.policyInfo).sensitiveAttributes;
      }
      let object = {attackerKnowledge: attackerKnowledge, sensitiveAttributes: sensitiveAttributes};
      root.businessObject.policyInfo = JSON.stringify(object);
    }
  }

  saveAttackerSettings() {
    this.updateAttackerSettings();
    this.terminateAttackerSettingsPanel();
    this.setNewModelContentVariableContent();
  }

  checkForUnsavedAttackerSettingsChangesBeforeTerminate() {
    if (this.areThereUnsavedChanges()) {
      if (confirm('Are you sure you wish to revert unsaved table constraints?')) {
        this.terminateAttackerSettingsPanel();
      } else {
        return false;
      }
    }
    this.terminateAttackerSettingsPanel();
  }

  areAttackerSettingsLoaded() {
    if ($('#sidebar').has('#attacker-settings-panel').length) {
      return true;
    }
    return false;
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

  areThereUnsavedChanges() {
    if (this.areAttackerSettingsLoaded()) {
      let currentSettings = JSON.stringify(this.getCurrentAttackerSettings());
      let savedSettings = JSON.stringify(this.getSavedAttackerSettings());
      if (currentSettings !== savedSettings) {
        return true;
      }
    }
    return false;
  }

  /** Wrappers to access elementsHandler functions*/

  updateModelContentVariable(xml: String) {
    this.elementsHandler.updateModelContentVariable(xml);
  }

}
