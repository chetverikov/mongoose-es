'use strict';

/**
 * @author <a href="mailto:ma.chetverikov@gmail.com">Maksim Chetverikov</a>
 */

var support = require('./support')
  , plugin = require('./../lib')
  , conn = support.mongoose_connect()
  , async = require('async')
  , should = require('should');

describe('Mapping', function() {

  var model;

  before(function(done) {
    var schema = require('./support/schema');

    schema.plugin(plugin, {
      mapping: {
        properties: {
          name: {
            type: 'string',
            index_analyzer: 'app_analyzer',
            search_analyzer: 'app_search_analyzer'
          }
        }
      },
      settings: {
        index: {
          analysis: {
            analyzer:{
              app_analyzer: {
                type: 'custom',
                tokenizer: 'nGram',
                filter: ['stopwords', 'app_ngram', 'asciifolding', 'lowercase', 'snowball', 'worddelimiter']
              },
              app_search_analyzer: {
                type: 'custom',
                tokenizer: 'standard',
                filter: ['stopwords', 'app_ngram', 'asciifolding', 'lowercase', 'snowball', 'worddelimiter']
              }
            },
            tokenizer: {
              nGram: {
                type: 'nGram',
                min_gram: 2,
                max_gram: 20
              }
            },
            filter: {
              snowball:{
                type:     'snowball',
                language: 'English'
              },
              app_ngram:{
                type: 'nGram',
                min_gram: 2,
                max_gram: 20
              },
              worddelimiter:{
                type: 'word_delimiter'
              },
              stopwords: {
                type:      'stop',
                stopwords: ['_english_'],
                ignore_case: true
              }
            }
          }
        }
      }
    });

    model = conn.model(support.random() + '_ModelSync', schema);

    done();
  });

  after(function(done) {
    done();//support.removeCreatedIndexByModel(model, done);
    conn.close();
  });

  it('create index', function(done) {
    model.es.createIndex(function(err, res, status) {
      should.ifError(err);
      status.should.be.equal(200);
      done();
    });
  });

  it('created docs', function(done) {
    var names = [
      'Jacob Andrews', 'Joshua Larkins', 'Tyler Livingston', 'Brandon Macduff', 'Robert Mackenzie',
      'Morgan Gill', 'Rachel White', 'Brooke Timmons', 'Kylie Fraser', 'Stephanie Ralphs'
    ];

    async.times(10, function(n, next) {
      model.create({
        name: names[n]
      }, function(err) {
        should.ifError(err);
        next();
      });
    }, function(err) {
      should.ifError(err);
      model.es.refresh(done);
    });
  });

  it.skip('search', function(done) {
    model.es.client.search({
      index: model.es.options.index,
      type: model.es.options.type,
      body: {
        query: {
          bool: {
            must: [{query_string: {default_field: 'name', query: 'ra'}}]
          }
        }
      }
    }, function(err, res) {
      should.ifError(err);

      res.hits.total.should.be.equal(4);
      res.hits.hits.should.have.length(4);

      done();
    });
  });
});
