import * as Viewer from 'bpmn-js/lib/NavigatedViewer';
import { AuthService } from '../auth/auth.service';
import { EditorComponent } from './editor.component';
import { HttpErrorResponse, HttpResponse } from '@angular/common/http';

declare let $: any;
declare function require(name: string);
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

  editor: EditorComponent;
  elementsHandler: any;

  analysisInput: any = {
    children: [],
    queries: '',
    epsilon: 1,
    beta: 0.1,
    schemas: '',
    attackerSettings: '',
    errorUB: 0.9,
    sigmoidBeta: 0.01,
    sigmoidPrecision: 5.0,
    dateStyle: 'European'
  };
  analysisResult: any = null;
  analysisInputTasksOrder: any = [];

  analysisErrors: any[] = [];
  numberOfErrorsInModel: Number = 0;

  init() {
    // No changes in model, so show previous analysis results
    if (!this.getChangesInModelStatus() &&
        Number.parseFloat(this.analysisInput.epsilon) == Number.parseFloat($('.epsilon-input').val()) &&
        Number.parseFloat(this.analysisInput.beta) == Number.parseFloat($('.beta-input').val()) &&
        this.analysisInput.attackerSettings == this.elementsHandler.attackerSettingsHandler.getAttackerSettings() &&
        Number.parseFloat(this.analysisInput.errorUB) == Number.parseFloat($('#estimated-noise-input').val()) &&
        Number.parseFloat(this.analysisInput.sigmoidBeta) == Number.parseFloat($('#sigmoid-smoothness-input').val()) &&
        Number.parseFloat(this.analysisInput.sigmoidPrecision) == Number.parseFloat($('#sigmoid-precision-input').val()) &&
        this.analysisInput.dateStyle == $('#datestyle-input').val()
    ) {
      this.showAnalysisResults();
      return;
    }

    // Changes in model, so run new analysis
    this.analysisInput = {
      children: [],
      queries: '',
      epsilon: 1,
      beta: 0.1,
      schemas: '',
      attackerSettings: '',
      errorUB: 0.9,
      sigmoidBeta: 0.01,
      sigmoidPrecision: 5.0,
      dateStyle: 'European'
    };
    let counter = this.getAllModelTaskHandlers().length;
    this.analysisErrors = [];
    for (let taskId of this.getAllModelTaskHandlers().map(a => a.task.id)) {
      this.prepareTaskAnalyzerInput(taskId, counter--, this.getAllModelTaskHandlers().length);
    }
    this.eventBus.on('element.click', (e) => {
      this.removeErrorHiglights();
    });
  }

  loadAnalysisPanelTemplate() {
    if ($('#sidebar').has('#analysis-panel').length) {
      this.initAnalysisPanels();
    } else {
      $('#sidebar').prepend($('<div>').load(config.frontend.host + '/' + config.sql_derivative_sensitivity_editor.folder + '/src/app/editor/templates/analysis-panels.html', () => {
        this.initAnalysisPanels();
      }));
    }
  }

  initAnalysisPanels() {
    $('#analysis-panel').off('click', '#run-analysis');
    let analysisPanels = $('#analysis-panels');
    analysisPanels.detach();
    $('#sidebar').prepend(analysisPanels);
    $('#sidebar').scrollTop(0);
    $('#analysis-panels').show();
    $('.beta-toggle').bootstrapToggle();
    $('.beta-toggle').change(() => {
      $('.beta-input').toggle();
      if (!$('.beta-toggle').prop('checked')) {
        $('.beta-input').val(-1);
      } else {
        $('.beta-input').val(0.1);
      }
    });
    $('#analysis-panel').on('click', '#run-analysis', (e) => {
      e.preventDefault();
      e.stopPropagation();
      let analysisPanels = $('#analysis-panels');
      analysisPanels.detach();
      $('#sidebar').prepend(analysisPanels);
      $('#sidebar').scrollTop(0);
      this.init();
      $('#analysis-results-panel').show();
    });
    $('#analysis-panel').on('click', '#analysis-settings-hide-button', (e) => {
      e.preventDefault();
      e.stopPropagation();
      this.removeErrorHiglights();
      $('#analysis-panels').hide();
    });
    $('#analysis-panel').on('click', '#attacker-settings-button', (e) => {
      e.preventDefault();
      e.stopPropagation();
      this.elementsHandler.attackerSettingsHandler.initAttackerSettingsEditProcess();
    });

    $(document).find('#estimated-noise-input').on('input', (e) => {
      let percent = Math.round($('#estimated-noise-input').val() * 100);
      $('#analysis-panel').find('#estimated-noise-label').text(percent);
    });

    $('#analysis-panel').on('click', '#disable-advanced-settings', (event) => {
      $('#advanced-settings').find('input').attr('disabled', true);
      $('#advanced-settings').css('opacity', '0.4');
      $(event.target).hide();
      $('#enable-advanced-settings').show();
      this.setChangesInModelStatus(true);
    });

    $('#analysis-panel').on('click', '#enable-advanced-settings', (event) => {
      $('#advanced-settings').find('input').attr('disabled', false);
      $('#advanced-settings').css('opacity', '1');
      $(event.target).hide();
      $('#disable-advanced-settings').show();
      this.setChangesInModelStatus(true);
    });
  }

  // Format analyser input and send it to the analyser
  prepareTaskAnalyzerInput(taskId: string, counter: number, amount: number) {
    let task = this.getTaskHandlerByTaskId(taskId);
    let taskQuery = task.getPreparedQuery();
    let taskSchema = task.getPreparedSchema();
    if (taskQuery && taskQuery.success) {
      let taskName = null;
      let taskSchemaCmd = "";
      if (taskSchema && taskSchema.success) {
        taskName = taskSchema.success.tableName;
        taskSchemaCmd = taskSchema.success.schema;
      } else {
        taskName = taskQuery.success.taskName;
      }
      let query = taskQuery.success.query;
      let fullQuery = "";
      let inputIds = task.getTaskInputObjects().map(a => a.id);
      let schemasQuery = "";
      for (let inputId of inputIds) {
        let dataObjectQueries = this.getPreparedQueriesOfDataObjectByDataObjectId(inputId);
        if (dataObjectQueries) {
          let alreadyAddedDataObject = this.analysisInput.children.filter(function (obj) {
            return obj.id == inputId;
          });
          if (alreadyAddedDataObject.length === 0) {
            this.analysisInput.children.push(dataObjectQueries);
            if (dataObjectQueries.schema) {
              let schema = dataObjectQueries.schema + "\n";
              schemasQuery += schema;
            }
          }
        }
      }
      fullQuery = "INSERT INTO " + taskName + " " + query;
      this.analysisInput.queries += fullQuery + "\n\n";
      this.analysisInput.schemas += schemasQuery;
      this.analysisInput.schemas += taskSchemaCmd;
      this.analysisInputTasksOrder.push({ id: taskId, order: Math.abs(counter - amount) });
      this.canvas.removeMarker(taskId, 'highlight-general-error');
      if (counter === 1) {
        if (this.analysisErrors.length === 0) {
          this.analysisInput.queries.trim();
          this.analysisInput.epsilon = Number.parseFloat($('.epsilon-input').val());
          this.analysisInput.beta = Number.parseFloat($('.beta-input').val());
          this.analysisInput.attackerSettings = this.elementsHandler.attackerSettingsHandler.getAttackerSettings();

          this.analysisInput.errorUB = Number.parseFloat($('#estimated-noise-input').val());
          this.analysisInput.sigmoidBeta = $('#sigmoid-smoothness-input').attr('disabled') ? -1 : Number.parseFloat($('#sigmoid-smoothness-input').val());
          this.analysisInput.sigmoidPrecision = $('#sigmoid-precision-input').attr('disabled') ? -1 : Number.parseFloat($('#sigmoid-precision-input').val());
          this.analysisInput.dateStyle = $('#datestyle-input').attr('disabled') ? -1 : $('#datestyle-input').val();

          $('.analysis-spinner').fadeIn();
          $('#analysis-results-panel-content').html('');
          this.runAnalysisREST(this.analysisInput);
        } else {
          this.showAnalysisErrorResults();
        }
      }
    } else {
      this.addUniqueErrorToErrorsList(taskQuery.error, [taskId]);
      if (counter === 1) {
        this.showAnalysisErrorResults();
      }
    }
  }

  // Call to the analyser
  runAnalysisREST(postData: any) {
    this.editor.http.post(config.backend.host + '/rest/sql-privacy/analyze-derivative-sensitivity', postData, AuthService.loadRequestOptions({ observe: 'response' })).subscribe(
      success => {
        this.formatAnalysisResults(success);
      },
      fail => {
        this.formatAnalysisErrorResults(fail);
      }
    );
  }

  // Format analysis result string
  formatAnalysisResults(success: HttpResponse<any>) {
    if (success.status === 200) {
      const resultsString = success.body.result;
      if (resultsString) {
        const lines = resultsString.split(String.fromCharCode(30));

        this.analysisResult = lines.map(
            (line) => {
              return line.split(String.fromCharCode(31)).map(
                  (item) => {
                    return item.split(String.fromCharCode(29));
                  }
              );
            }
        );

        this.setChangesInModelStatus(false);

        this.showAnalysisResults();
      }
    }
  }

  // Format analysis error string
  formatAnalysisErrorResults(fail: HttpErrorResponse) {
    if (fail.status === 409) {
      this.analysisResult = fail.error.error;
      this.analysisResult = this.analysisResult.replace("WARNING:  there is no transaction in progress", "");
    } else if (fail.status === 400) {
      this.analysisResult = "Analyzer error";
    } else {
      this.analysisResult = "Server error";
    }
    this.showAnalysisErrorResult();
  }

  // Show analysis results table
  showAnalysisResults() {
    if (this.analysisResult) {
      let resultDiv = '';

      let getLine = (line) => {
        line.shift();

        return line.reduce((value, item) => {
          return value + `
                <div class="panel panel-default sub-panel">
                  <div class="panel-heading" style="text-align:center;">
                    <b>` + item[0] + `</b>
                  </div>
                  <div class="panel-body">
                    <table style="width:100%">
                      <tbody>
                        <tr>
                         <td style="text-align: left;"><strong>beta-smooth sensitivity</strong></td>
                         <td>` + item[1] + `</td>
                        <tr>
                        <tr>
                         <td style="text-align: left;"><strong>actual outputs y</strong></td>
                         <td>` + item[2] + `</td>
                        <tr>
                        <tr>
                         <td style="text-align: left;"><strong>` + Math.round(this.analysisInput.errorUB * 100) + `%-noise magnitude </strong></td>
                         <td>` + item[3] + `</td>
                        <tr>
                        <tr>
                         <td style="text-align: left;"><strong>` + Math.round(this.analysisInput.errorUB * 100) + `%-realtive error |a|/|y|</strong></td>
                         <td>` + item[4] + `</td>
                        <tr>
                        <tr class="view-more-results-div">
                            <td colspan="2"  style="text-align:right;margin-top:10px;margin-bottom:10px"><span class="more-results-link">View more</span></td>
                        </tr>
                      </tbody>
                      <tbody style="display:none" class="more-analysis-results">
                        <tr>
                         <td style="text-align: left;"><strong>smoothness beta (after optimization)</strong></td>
                         <td>` + item[5] + `</td>
                        <tr>
                        <tr>
                         <td style="text-align: left;"><strong>delta (Laplace only)</strong></td>
                         <td>` + item[6] + `</td>
                        <tr>
                         <td style="text-align: left;"><strong>` + Math.round(this.analysisInput.errorUB * 100) + `%-noise magnitude (Laplace)</strong></td>
                         <td>` + item[7] + `</td>
                        <tr>
                        <tr>
                         <td style="text-align: left;"><strong>` + Math.round(this.analysisInput.errorUB * 100) + `%-realtive error (Laplace)</strong></td>
                         <td>` + item[8] + `</td>
                        <tr>
                        <tr>
                         <td style="text-align: left;"><strong>norm N</strong></td>
                         <td>` + item[9] + `</td>
                        <tr>
                      </tbody>
                    </table>
                  </div>
                </div>`;
        }, '');
      };

      this.analysisResult.forEach((line, i) => {
        resultDiv += `
           <div class="" id="` + i + `-analysis-results">
              <div class="panel panel-default" style="cursor:pointer; margin-bottom:10px!important" data-toggle="collapse" data-target="#` + i + `-panel" aria-expanded="true" aria-controls="` + i + `-panel">
                <div align="center" class="panel-heading" style="background-color:#eae8e8">
                  <b><span style="font-size: 16px; color: #666">` + line[0] + `</span></b>
                </div>
              </div>
              <div align="left" class="collapse in" id="` + i + `-panel" style="margin-bottom: 10px; margin-top: -10px">
              ` + getLine(line) + `
              </div>
            </div>`;
      });

      $('.analysis-spinner').hide();
      $('#analysis-results-panel-content').html(resultDiv);

      $('#analysis-results-panel-content').on('click', '.more-results-link', (event) => {
        console.log(event.target);
        $(event.target).parents('.panel-body').find('.more-analysis-results').show();
        $(event.target).parents('.panel-body').find('.view-more-results-div').hide();
      });
    }
  }

  // Show analysis errors list
  showAnalysisErrorResults() {
    $('#analysis-results-panel-content').html('');
    this.removeErrorHiglights();
    this.removeErrorsListClickHandlers();
    this.numberOfErrorsInModel = 0;
    if (this.analysisErrors.length > 0) {
      this.numberOfErrorsInModel = this.analysisErrors.length;
      let errors_list = '<ol style="text-align:left">';
      let i = 0;
      for (let error of this.analysisErrors) {
        let errorMsg = error.error.charAt(0).toUpperCase() + error.error.slice(1);
        errors_list += '<li class="error-list-element error-' + i + '" style="font-size:16px; color:darkred; cursor:pointer;">' + errorMsg + '</li>';
        $('#analysis-results-panel-content').on('click', '.error-' + i, (e) => {
          this.highlightObjectWithErrorByIds(error.object);
          $(e.target).css("font-weight", "bold");
        });
        i++;
      }
      errors_list += '</ol>';
      $('.analysis-spinner').hide();
      $('#analysis-results-panel-content').html(errors_list);
    }
  }

  // Show one error from analyzer
  showAnalysisErrorResult() {
    let resultsHtml = '<div style="text-align:left; word-break: break-word; white-space: pre-wrap;"><font style="color:darkred"><span class="glyphicon glyphicon-exclamation-sign" aria-hidden="true"></span> ' + this.analysisResult + '</font></div>';
    $('.analysis-spinner').hide();
    $('#analysis-results-panel-content').html(resultsHtml);
  }

  // Add unique error to errors list
  addUniqueErrorToErrorsList(error: String, ids: String[]) {
    let errors = this.analysisErrors;
    let sameErrorMsgs = errors.filter(function (obj) {
      return obj.error == error && obj.object.toString() === ids.toString();
    });
    if (sameErrorMsgs.length === 0) {
      errors.push({ error: error, object: ids });
    }
  }

  // Remove click handlers of error links in errors list
  removeErrorsListClickHandlers() {
    for (let j = 0; j < this.numberOfErrorsInModel; j++) {
      $('#analysis-results-panel-content').off('click', '.error-' + j);
    }
  }

  // Highlight objects with stereotype errors by ids
  highlightObjectWithErrorByIds(generalIds: String[]) {
    this.removeErrorHiglights();
    for (let id of generalIds) {
      this.canvas.addMarker(id, 'highlight-general-error');
    }
  }

  // Remove error highlights
  removeErrorHiglights() {
    $('.error-list-element').css("font-weight", "");
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
