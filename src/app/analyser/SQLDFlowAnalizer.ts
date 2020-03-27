import { dataFlowAnalysis, computeSensitivitiesMatrix } from './GraMSecAnalizer';
import { AuthService } from '../auth/auth.service';
import { EventEmitter, Output } from '@angular/core';
import { HttpClient, HttpResponse } from '@angular/common/http';

declare function require(name: string);
declare var $: any;
declare var CodeMirror: any;

const pg_parser = require('exports-loader?Module!pgparser/pg_query.js');
const config = require('./../../config.json');

const is = (element, type) => element.$instanceOf(type);

let errorInModel = false;

let analyseInProgress = true;

const analyzeProcessingNode = (nodeId: string, eventBus: any, dataDefStatements: { [id: string]: string }, outputDefStatements: { [id: string]: string }, dataFlowEdges: any, invDataFlowEdges: any, registry: any, canvas: any, overlays: any, overlaysMap: any, http: HttpClient) => {

  const node = registry.get(nodeId).businessObject;

  if (!node.sqlScript) {
    Analyser.analysisError.emit([{ error: 'SQL script not found', id: nodeId }]);
    return;
  }

  // console.log('parsing stored procedure', node.sqlScript);
  const result = pg_parser.parse(node.sqlScript);

  if (result.parse_tree.length) {

    if (result.parse_tree[0].CreateFunctionStmt) {

      const stprocBody = result.parse_tree[0].CreateFunctionStmt.options[0].DefElem.arg[0].String.str;
      const embeddedQuery = pg_parser.parse(stprocBody);

      if (embeddedQuery.parse_tree.length) {

        let numberOfColumns = 0;
        if (embeddedQuery.parse_tree[0].SelectStmt.targetList) {
          numberOfColumns = embeddedQuery.parse_tree[0].SelectStmt.targetList.length;
        }
        const numberOfParameters = result.parse_tree[0].CreateFunctionStmt.parameters.length;
        let offset = 0;
        if (numberOfColumns !== 0) {
          offset = numberOfParameters - numberOfColumns;
        }
        const outputData = registry.get(dataFlowEdges[nodeId][0]).businessObject;
        const tableName = outputData.name.replace(/\s+$/, '').replace(/ *\([^)]*\) */g, '').replace(/[^\w\s]/gi, '').replace(/[\s]/gi, '_');
        let outputCreateStatement = `create table ${tableName} (`;

        for (let i = offset; i < numberOfParameters; i++) {

          const param = result.parse_tree[0].CreateFunctionStmt.parameters[i].FunctionParameter;

          if (i > offset) {
            outputCreateStatement += ', ';
          }

          outputCreateStatement += param.name + ' ' + param.argType.TypeName.names[0].String.str;
        }

        outputCreateStatement += ');';
        outputCreateStatement = outputCreateStatement.replace(/\r?\n|\r/g, '');

        const obj_schema = [];
        for (let i = 0, len = invDataFlowEdges[nodeId].length; i < len; i++) {
          const parseTree = pg_parser.parse(dataDefStatements[invDataFlowEdges[nodeId][i]].replace(/\r?\n|\r/g, ' '));
          const tableId = invDataFlowEdges[nodeId][i];
          const script = dataDefStatements[invDataFlowEdges[nodeId][i]].replace(/\r?\n|\r/g, ' ');
          obj_schema.push({ tableId: tableId, script: script });
        }

        const obj_query = stprocBody.replace(/\r?\n|\r/g, ' ');
        analyseInProgress = true;

        const analysisHtml = `
            <div class="spinner">
              <div class="double-bounce1"></div>
              <div class="double-bounce2"></div>
            </div>`;

        $('#messageModal').find('.modal-title').text('Analysis in progress...');
        $('#messageModal').find('.modal-body').html(analysisHtml);
        $('#messageModal').modal('show');

        http.post(config.backend.host + '/rest/sql-privacy/analyse', { schema: obj_schema, query: obj_query }, AuthService.loadRequestOptions({observe: 'response'})).subscribe(
            (success: HttpResponse<any>) => {
            if (success.status === 200) {
              const res = success.body;
              errorInModel = false;
              $('#analyserInputError').hide();
              let resultRows = '';
              const matrix = {};

              for (let i = 0; i < (res.resultSet).length; i++) {
                const resultSensitivity = res.resultSet[i].sensitivity >= 0 ? res.resultSet[i].sensitivity : Infinity;
                resultRows += '<tr><td>' + registry.get(res.resultSet[i].tableId).businessObject.name + '</td><td>' + resultSensitivity + '</td><tr>';
                const inputName = res.resultSet[i].tableId;
                const outputName = outputData.id;
                const sensitivity = res.resultSet[i].sensitivity;
                matrix[inputName] = { [outputName]: sensitivity };
              }

              if (res.primaryKeysSet && res.primaryKeysSet.indexOf(1) > -1) {
                outputCreateStatement = `create table ${tableName} (`;

                for (let i = offset; i < numberOfParameters; i++) {
                  const param = result.parse_tree[0].CreateFunctionStmt.parameters[i].FunctionParameter;
                  if (i > offset) {
                    outputCreateStatement += ', ';
                  }

                  let pKey = '';
                  if (res.primaryKeysSet[i] === 1) {
                    pKey = ' primary key';
                  }

                  outputCreateStatement += param.name + ' ' + param.argType.TypeName.names[0].String.str + pKey;
                }

                outputCreateStatement += ');';
                outputCreateStatement = outputCreateStatement.replace(/\r?\n|\r/g, '');
              }

              const overlayHtml = $(`
                <div class="code-dialog" id="` + nodeId + `-analysis-results">
                  <div class="panel panel-default">
                    <div align="left" class="panel-heading">
                      <b>Output SQL</b>
                    </div>
                    <div class="panel-body">
                      <textarea id="` + nodeId + `-analysis-textarea" class="hidden-code-input">${outputCreateStatement}</textarea>
                    </div>
                    <div align="left" class="panel-heading">
                      <b>Sensitivities</b>
                    </div>
                    <div class="panel-body">
                      <div class="table-responsive">
                        <table class="table table-hover">
                          <thead>
                            <tr>
                              <th>TableId</th>
                              <th>Sensitivity</th>
                            </tr>
                          </thead>
                          <tbody>
                            ${resultRows}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  </div>
                </div>`
              );

              node.sensitivityMatrix = JSON.stringify(matrix);



              outputDefStatements[outputData.id] = outputCreateStatement;

              analyseInProgress = false;
              canvas.addMarker(nodeId, 'highlight-input');
              Analyser.analysisCompleted.emit({ node: node, overlayHtml: overlayHtml });

              const element = registry.get(nodeId);
              eventBus.fire('element.click', { element: element });
            }
          },
          fail => {
            if (fail.status === 400) {
              errorInModel = true;
              $('#analyserInputError').show();
            } else {
              alert('Server error!');
            }
          }
        );

      } else {
        Analyser.analysisError.emit([{ error: `${embeddedQuery.error.message}`, id: nodeId }]);
        return;
      }

    } else {

      Analyser.analysisError.emit([{ error: `Stored procedure not found`, id: nodeId }]);
      return;
    }

  } else {
    setTimeout(() => {
      $('#messageModal').modal('hide');
    }, 1000);

    Analyser.analysisCompleted.emit({ node: node, overlayHtml: `<div class="code-error">${result.error.message}</div>` });
  }

};

export class Analyser {
  @Output() static analysisCompleted: EventEmitter<any> = new EventEmitter();
  @Output() static analysisError: EventEmitter<any> = new EventEmitter();
  public static analizeSQLDFlow(element: any, registry: any, canvas: any, overlays: any, eventBus: any, http: HttpClient) {

    const info = dataFlowAnalysis(element, registry);
    const [processingNodes, dataFlowEdges, invDataFlowEdges] = [info.processingNodes, info.dataFlowEdges, info.invDataFlowEdges, info.sources];
    const dataDefStatements: { [id: string]: string } = {};
    const outputDefStatements: { [id: string]: string } = {};

    const errors = [];

      for (const source of info.sources) {
        const node = registry.get(source).businessObject;

        if (!node.sqlScript) {
          errors.push({ error: 'SQL script not found', id: node.id });
          continue;
        }

        // console.log('parsing schema definition', node.sqlScript);
        const result = pg_parser.parse(node.sqlScript);

        if (result.parse_tree.length) {
          dataDefStatements[source] = node.sqlScript;
        } else {
          errors.push({ error: result.error.message, id: node.id })
        }
      }

    if (errors.length) {
      Analyser.analysisError.emit(errors);
      return;
    }



    const alreadyProcessed: Array<string> = [];
    const overlaysMap: { [id: string]: any } = {};
    let enabledNodes = processingNodes.filter((nodeId: string) => alreadyProcessed.indexOf(nodeId) < 0 && invDataFlowEdges[nodeId].every((predId: string) => dataDefStatements[predId]));

    enabledNodes.forEach((nodeId: string) => analyzeProcessingNode(nodeId, eventBus, dataDefStatements, outputDefStatements, dataFlowEdges, invDataFlowEdges, registry, canvas, overlays, overlaysMap, http));

    eventBus.on('element.click', function (e: any) {

      if (is(e.element.businessObject, 'bpmn:Task') && !analyseInProgress) {
        const node = e.element.businessObject;

        if (enabledNodes.indexOf(node.id) >= 0 && !errorInModel) {
          canvas.removeMarker(node.id, 'highlight-input');

          if (overlaysMap[node.id]) {
            overlays.remove(overlaysMap[node.id]);
          }

          alreadyProcessed.push(node.id);
          const outputDataId = dataFlowEdges[node.id][0];
          dataDefStatements[outputDataId] = outputDefStatements[outputDataId];

          if (dataFlowEdges[outputDataId] && dataFlowEdges[outputDataId].length > 0) {
            const newlyEnabledNodes = dataFlowEdges[outputDataId].filter((nodeId: string) => invDataFlowEdges[nodeId].every((predId: string) => dataDefStatements[predId]));
            newlyEnabledNodes.forEach((nodeId: string) => analyzeProcessingNode(nodeId, eventBus, dataDefStatements, outputDefStatements, dataFlowEdges, invDataFlowEdges, registry, canvas, overlays, overlaysMap, http));
            enabledNodes = enabledNodes.concat(newlyEnabledNodes);
          }

          enabledNodes.splice(enabledNodes.indexOf(node.id), 1);

          if (enabledNodes.length === 0) {
            const [dc, sources, targets] = computeSensitivitiesMatrix(element, registry);

            if (!$.isEmptyObject(dc)) {
              const getName = function (id: String) {
                const fullName = registry.get(id).businessObject.name;
                let shortName;
                if (fullName != null) {
                  shortName = fullName.match(/\(([^\)]+)\)/);
                }
                return shortName ? shortName[1] : fullName;
              };

              let targetsHtml = '';
              for (const target of targets) {
                targetsHtml += '<td class="inlined-matrix" style="min-width: 30px;">' + getName(target) + '</td>';
              }

              let sourcesHtml = '';
              let resultCellsIdCounter = 1;
              const cellInputOutputDict = {};

              for (const source2 of sources) {
                sourcesHtml += `<tr class="inlined-matrix">`;
                sourcesHtml += `<td class="inlined-matrix" style="min-width: 30px;">` + getName(source2) + `</td>`;
                for (const target2 of targets) {
                  cellInputOutputDict['resultCell' + resultCellsIdCounter] = {input: source2, output: target2};
                  const value = dc[source2][target2] ? dc[source2][target2] : (dc[source2][target2] === 0 ? dc[source2][target2] : '');
                  sourcesHtml += `<td id="resultCell` + resultCellsIdCounter + `" class="inlined-matrix">` + value + `</td>`;
                  resultCellsIdCounter++;
                }
                sourcesHtml += `</tr>`;
              }

              const resultTable = `
                <div>
                  <table class="inlined-matrix result-matrix">
                    <p style="font-size:16px">Sensitivity matrix:</p>
                    <tbody>
                      <tr class="inlined-matrix">
                        <td class="inlined-matrix"></td>
                        ` + targetsHtml + `
                      </tr>
                      ` + sourcesHtml + `
                    </tbody>
                  </table>
                </div>
              `;

              $('#messageModal').find('.modal-title').text('Results');
              $('#messageModal').find('.modal-body').html(resultTable);

              Analyser.analysisCompleted.emit({ node: { id: 'result', name: 'Result Table' }, overlayHtml: $(resultTable) });
              overlays.remove({ element: e.element });

              // Wait until jquery rendered result table
              setTimeout(function () {
                for (let i = 1; i < resultCellsIdCounter; i++) {
                  $('#resultCell' + i).on('click', (event) => {
                    const opacity = $('#messageModal').css('opacity');
                    if (opacity === 1) {
                      $('#messageModal').css('opacity', 0.6);
                      $(event.target).addClass('cell-selected');
                      canvas.addMarker(cellInputOutputDict[event.target.id].input, 'highlight-input-selected');
                      canvas.addMarker(cellInputOutputDict[event.target.id].output, 'highlight-output-selected');
                    } else {
                      $('#messageModal').css('opacity', 1);
                      for (let j = 1; j < resultCellsIdCounter; j++) {
                        $('#resultCell' + j).removeClass('cell-selected');
                        canvas.removeMarker(cellInputOutputDict['resultCell' + j].input, 'highlight-input-selected');
                        canvas.removeMarker(cellInputOutputDict['resultCell' + j].output, 'highlight-output-selected');
                      }
                    }
                  });
                }
              }, 200);
            }
          }
        }
      }
    });
  }
}
