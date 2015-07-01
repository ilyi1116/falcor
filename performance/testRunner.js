var Benchmark = require('benchmark');
var CSVFormatter = require('./formatter/CSVFormatter');

var KARMA = global.__karma__;

function createSuite(testCfg, iteration) {

    var tests = testCfg.tests;
    var testName;

    var suite = ((KARMA) ? global.suite : Benchmark.Suite)(testCfg.name + ':' + iteration, function() {});

    for (testName in tests) {
        if (KARMA) {
            global.benchmark(testName, tests[testName], {defer: true});
        } else {
            suite.add(testName, tests[testName], {defer: true});
        }
    }

    return suite;
}

function createSuites(testCfg, iterations) {
    var suites = [];

    for (var i = 0; i < iterations; i++) {
        suites.push(createSuite(testCfg, i));
    }

    return suites;
}

function runner(testCfg, iterations, env, onComplete) {

    var suites = createSuites(testCfg, iterations);

    if (!KARMA) {
        run(suites, env, onComplete);
    } else {
        // KARMA will run the global "suites"
    }
}

function run(suites, env, onComplete) {

    var results = {};

    console.log('about to run');
    debugger
    var _run = function() {

        suites.shift().
            on('cycle', function (event) {
                console.log('ran.cycle');
                var benchmark = event.target;
                var suite = benchmark.suite = this.name;

                var tests = results[env] = results[env] || {};

                tests[suite] = tests[suite] || [];
                tests[suite].push(benchmark);

                console.info(CSVFormatter.toRow(benchmark, env));
            }).
            on('error', function(e) {
                console.log('ran.error');
                console.log(e.target.error);
            }).
            on('complete', function() {
                console.log('ran.completed');
                if (suites.length === 0) {
                    onComplete(results);
                } else {
                    _run();
                }
            }).
            run({
                async: true
            });
    };

    _run();
}

module.exports = runner;
