# Pleak sensitivities editor

This project is the front-end part of the [SQL derivative sensitivity and SQL combined sensitivity analysis tools](https://github.com/pleak-tools/pleak-sql-analysis/tree/master/banach) and [SQL global sensitivity analysis tool](https://github.com/pleak-tools/pleak-sql-analysis/tree/master/globalsensitivity-cabal) that are SQL analyzers in [SQL analysis tools](https://github.com/pleak-tools/pleak-sql-analysis).

## Prerequisites

You need to locate pleak-sensitivities-editor, [pleak-backend](https://github.com/pleak-tools/pleak-backend), [pleak-frontend](https://github.com/pleak-tools/pleak-frontend) and [pleak-sql-analysis](https://github.com/pleak-tools/pleak-sql-analysis) directories all in the same directory and specify their names in the config.json file.
Read more from sub-repositories how to build each module.

To use all functionalities of the Sensitivities editor, clone the [pleak-sql-analysis](https://github.com/pleak-tools/pleak-sql-analysis) repository and to make all the analyzers available for the editor, install:

1) SQL derivative sensitivity analyzer (also builds SQL combined sensitivity analyzer), instructions in [SQL derivative sensitivity analysis tool repository](https://github.com/pleak-tools/pleak-sql-analysis/tree/master/banach)

2) SQL local sensitivity analyzer, instructions in [SQL local sensitivity analysis tool repository](https://github.com/pleak-tools/pleak-sql-analysis/tree/master/localsensitivity-cabal)

3) SQL global sensitivity analyzer, instructions in [SQL global sensitivity analysis tool repository](https://github.com/pleak-tools/pleak-sql-analysis/tree/master/globalsensitivity-cabal).

SQL combined sensitivity analyzer uses both - SQL global sensitivity analyzer and SQL local sensitivity analyzer.

## Build

To build the editor you need: NodeJS with npm installed.

To install all project dependencies execute `npm install`.

Execute `npm run build` to build the project. The build artifacts will be stored in the `dist/` directory.

## Using

You can use the editor for each model from the Action menu next to the model on Files page (of frontend) or from the URL: http://localhost:8000/sensitivities-editor/id (id of the model).

## License

MIT