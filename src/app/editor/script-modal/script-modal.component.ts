import { Component, Input, Output, EventEmitter, ViewChild } from '@angular/core';

declare let $: any;

@Component({
  selector: 'app-script-modal',
  templateUrl: './script-modal.component.html',
  styleUrls: ['./script-modal.component.less'],
})
export class ScriptModalComponent {

  @Input()canEdit: boolean;

  @Output() script = new EventEmitter();
  @Output() save = new EventEmitter();

  @ViewChild('scriptCodeMirror', { static: false }) scriptInput: any;

  input: string = null;
  name: string = null;
  type: string = null;
  elementId: string = null;

  openModal(value: any) {
    this.input = null;
    this.name = null;
    this.type = null;
    this.elementId = null;
    let inputObject = JSON.parse(value);
    this.name = inputObject.name;
    this.type = inputObject.type;
    this.elementId = inputObject.id;
    setTimeout(() => {
      if (!inputObject.value || inputObject.value && inputObject.value.length === 0) {
        this.input = " ";
      } else {
        this.input = inputObject.value;
      }
    }, 300);
    $('#scriptUpdateModal').modal();
  }

  inputChanged(value: string): void {
    let inputObj = {value: "", type: this.type, id: this.elementId};
    if (value === undefined || value === null || value.length === 0 || value == "") {
      inputObj.value = " ";
    } else {
      inputObj.value = value;
    }
    this.script.emit(JSON.stringify(inputObj));
  }

  saveInput(): void {
    this.save.emit(JSON.stringify({id: this.elementId, type: this.type}));
    $('#scriptUpdateModal').modal('hide'); 
  }

}