import * as Rx from 'rxjs/Rx';
import { Subject } from "rxjs/Subject";
import * as Viewer from 'bpmn-js/lib/NavigatedViewer';

declare let $: any;
declare function require(name:string);
let is = (element, type) => element.$instanceOf(type);

let config = require('../../config.json');

export class AnalysisHandler {

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

  analysisInput: any = {children: [], queries: "", epsilon: 1, beta: 0.1};
  analysisResult: any = null;
  analysisInputTasksOrder: any = [];

  init() {
    // No changes in model, so show previous analysis results
    if (!this.getChangesInModelStatus() && Number.parseFloat(this.analysisInput.epsilon) == Number.parseFloat($('.epsilon-input').val()) && Number.parseFloat(this.analysisInput.beta) == Number.parseFloat($('.beta-input').val())) {
      this.showAnalysisResults();
      return;
    }

    // Changes in model, so run new analysis
    this.analysisInput = {children: [], queries: "", epsilon: 1, beta: 0.1};
    let counter = this.getAllModelTaskHandlers().length;
    for (let taskId of this.getAllModelTaskHandlers().map(a => a.task.id)) {
      if (!this.prepareTaskAnalyzerInput(taskId, counter--, this.getAllModelTaskHandlers().length)) {
        this.showAnalysisErrorResults();
        return;
      }
    }
  }

  // Format analyser input and send it to the analyser
  prepareTaskAnalyzerInput(taskId: string, counter: number, amount: number) {
    let task = this.getTaskHandlerByTaskId(taskId);
    let taskQuery = task.getPreparedQuery();
    if (taskQuery && taskQuery.success) {
      let taskName = taskQuery.success.taskName;
      let query = taskQuery.success.query;
      let fullQuery = "";
      let inputIds = task.getTaskInputObjects().map(a => a.id);
      for (let inputId of inputIds) {
        let dataObjectQueries = this.getPreparedQueriesOfDataObjectByDataObjectId(inputId);
        if (dataObjectQueries) {
          this.analysisInput.children.push(dataObjectQueries);
        }
      }
      fullQuery = taskName + " = " + query;
      this.analysisInput.queries += fullQuery + "\n\n";
      this.analysisInputTasksOrder.push({id: taskId, order: Math.abs(counter-amount)});
      this.canvas.removeMarker(taskId, 'highlight-general-error');
      if (counter === 1) {
        this.analysisInput.queries.trim();
        this.analysisInput.epsilon = Number.parseFloat($('.epsilon-input').val());
        this.analysisInput.beta = Number.parseFloat($('.beta-input').val());
        $('.analysis-spinner').fadeIn();
        $('#analysis-results-panel-content').html('');
        this.runAnalysisREST(this.analysisInput);
      }
      return true;
    } else {
      this.canvas.addMarker(taskId, 'highlight-general-error');
      this.analysisResult = taskQuery.error;
      return false;
    }
  }

  // Call to the analyser
  runAnalysisREST(postData: any) {
    this.editor.http.post(config.backend.host + '/rest/sql-privacy/analyze-derivative-sensitivity', postData, this.editor.authService.loadRequestOptions()).subscribe(
      success => {
        this.formatAnalysisResults(success);
      },
      fail => {
        this.formatAnalysisErrorResults(fail);
      }
    );
  }

  // Format analysis result string
  formatAnalysisResults(success: any) {
    if (success.status === 200) {
      let resultsString = JSON.parse((<any>success)._body).result
      if (resultsString) {
        let lines = resultsString.split(String.fromCharCode(30));
        let results = []
        for (let line of lines) {
          let parts = line.split(String.fromCharCode(31));
          let taskName = parts[0];
          let taskHandler = this.getTaskHandlerByPreparedTaskName(taskName);
          let order = 0;
          let taskWithTaskId = this.analysisInputTasksOrder.filter(function( obj ) {
            return obj.id == taskHandler.task.id;
          });
          if (taskWithTaskId.length > 0) {
            order = taskWithTaskId[0].order;
          }
          let taskInfo = {id: taskHandler.task.id, name: taskHandler.task.name, children: [], order: order}
          for (let i = 1; i < parts.length; i++) {
            if (i==1 || i%5==1) {
              let tbl = {tableId: 0, name: parts[i], qoutput: parts[i+2], anoise: parts[i+3], sensitivity: parts[i+1], error: parts[i+4]}
              taskInfo.children.push(tbl);
            }
          }
          results.push(taskInfo);
          this.analysisResult = results;
          this.setChangesInModelStatus(false);
        }
        this.showAnalysisResults();
      }
    }
  }

  // Format analysis error string
  formatAnalysisErrorResults(fail: any) {
    if (fail.status === 409) {
      let resultsString = JSON.parse((<any>fail)._body).error;
      let parts = resultsString.split("ERROR: ");
      if (parts.length > 1) {
        this.analysisResult = parts[1];
      } else {
        this.analysisResult = "Invalid input";
      }
    } else if (fail.status === 400) {
      this.analysisResult = "Analyzer error";
    } else {
      this.analysisResult = "Server error";
    }
    this.showAnalysisErrorResults();
  }

  // Show analysis results table
  showAnalysisResults() {
    if (this.analysisResult) {
      let resultsHtml = '';
      for (let i = 0; i < this.analysisResult.length; i++) {
        let matchingTask = this.analysisResult.filter(function( obj ) {
          return obj.order == i;
        });
        if (matchingTask.length > 0) {
          let resultObject = matchingTask[0];
          let collapsed = "collapsed";
          if (resultObject.order == this.analysisResult.length-1) {
            collapsed = "in";
          }
          
          let resultDiv = `
           <div class="" id="` + resultObject.id + `-analysis-results">
              <div class="panel panel-default" style="cursor:pointer; margin-bottom:10px!important" data-toggle="collapse" data-target="#` + resultObject.id + `-panel" aria-expanded="false" aria-controls="` + resultObject.id + `-panel">
                <div align="center" class="panel-heading" style="background-color:#eae8e8">
                  <b><span style="font-size: 16px; color: #666">` + resultObject.name + `</span></b>
                </div>
              </div>
              <div align="left" class="collapse ` + collapsed + `" id="` + resultObject.id + `-panel" style="margin-bottom: 10px; margin-top: -10px">`;
          let tmp = "";
          for (let tblObject of resultObject.children) {
            let sensitivity: any = Number.parseFloat(tblObject.sensitivity).toFixed(5);
            sensitivity = (sensitivity == 0 ? 0 : sensitivity);
            sensitivity = ( isNaN(sensitivity) ? "&infin;" : sensitivity );

            let error: any = Number.parseFloat(tblObject.error).toFixed(5);
            error = (error == 0 ? 0 : error);
            error = ( isNaN(error) ? "&infin;" : error  + " %" );

            let addedNoise: any = Number.parseFloat(tblObject.anoise).toFixed(5);
            addedNoise = (addedNoise == 0 ? 0 : addedNoise);

            let queryOutput: any = Number.parseFloat(tblObject.qoutput).toFixed(5);
            queryOutput = (queryOutput == 0 ? 0 : queryOutput);

            let headingBg = ( tblObject.name == "all input tables together" ? "background-color: #ddd;" : "" );
            let resultSubDiv = `
                <div class="panel panel-default sub-panel">
                  <div class="panel-heading" style="text-align:center; ` + headingBg + `">
                    <b>` + tblObject.name + `</b>
                  </div>
                  <div class="panel-body">
                    <table style="width:100%">
                      <tbody>
                        <tr><td style="width:70%"><b>Derivative sensitivity</b></td><td>` + sensitivity + `</td><tr>
                        <tr><td style="width:70%"><b>Additive noise</b></td><td>` + addedNoise + `</td><tr>
                        <tr><td style="width:70%"><b>Query output</b></td><td>` + queryOutput + `</td><tr>
                        <tr><td style="width:70%"><b>Relative error <br/>(additive noise / query output)</b></td><td>` + error + `</td><tr>
                      </tbody>
                    </table>
                  </div>
                </div>`;
            if (tblObject.name != "all input tables together") {
              resultDiv += resultSubDiv;
            } else {
              tmp = resultSubDiv;
            }
          }
          resultDiv += "<hr/>"+tmp;
          resultDiv += `
              </div>
            </div>`;
          resultsHtml += resultDiv;
        }
      }
      $('.analysis-spinner').hide();
      $('#analysis-results-panel-content').html(resultsHtml);
    }
  }

  // Show analysis error
  showAnalysisErrorResults() {
    let resultsHtml = '<div style="text-align:left"><font style="color:darkred"><span class="glyphicon glyphicon-exclamation-sign" aria-hidden="true"></span> ' + this.analysisResult + '</font></div>';
    $('.analysis-spinner').hide();
    $('#analysis-results-panel-content').html(resultsHtml);
  }

  // Remove error highlights
  removeErrorHiglights() {
    $('#analysis-results-panel').hide();
    for (let taskHandler of this.getAllModelTaskHandlers()) {
      this.canvas.removeMarker(taskHandler.task.id, 'highlight-general-error');
    }
  }

  /* Wrapper functions to access elementHandler's functions */

  getTaskHandlerByTaskId(taskId: string) {
    return this.elementsHandler.getTaskHandlerByTaskId(taskId);
  }

  getPreparedQueriesOfDataObjectByDataObjectId(dataObjectId: string) {
    return this.elementsHandler.getDataObjectHandlerByDataObjectId(dataObjectId).getPreparedQueries();
  }

  getTaskHandlerByPreparedTaskName(preparedName: string) {
    return this.elementsHandler.getTaskHandlerByPreparedTaskName(preparedName);
  }

  getAllModelTaskHandlers() {
    return this.elementsHandler.getAllModelTaskHandlers();
  }

  /* Wrapper functions to access editor's functions */

  getChangesInModelStatus() {
    return this.editor.getChangesInModelStatus();
  }

  setChangesInModelStatus(status: boolean) {
    this.editor.setChangesInModelStatus(status);
  }

}