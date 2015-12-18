'use strict';

/**
 * @author <a href="mailto:ma.chetverikov@gmail.com">Maksim Chetverikov</a>
 */

var support = require('./support')
  , plugin = require('./../lib')
  , conn = support.mongoose_connect()
  , _ = require('lodash')
  , should = require('should');

describe('Mapping', function() {

  var model;

  before(function() {
    var schema = require('./support/schema');

    schema.plugin(plugin, {
      mapping: {
        properties: {
          name: {
            type: 'string',
            analyzer: 'app_analyzer',
            search_analyzer: 'app_search_analyzer'
          }
        }
      },
      settings: {
        index: {
          analysis: {
            analyzer: {
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
              snowball: {
                type: 'snowball',
                language: 'English'
              },
              app_ngram: {
                type: 'nGram',
                min_gram: 2,
                max_gram: 20
              },
              worddelimiter: {
                type: 'word_delimiter'
              },
              stopwords: {
                type: 'stop',
                stopwords: ['_english_'],
                ignore_case: true
              }
            }
          }
        }
      }
    });

    model = conn.model(support.random() + '_ModelSync', schema);

    return model.es.createIndex();
  });

  after(function() {
    return support
      .removeCreatedIndexByModel(model)
      .then(function() {
        conn.close();
      });
  });

  it('created docs', function() {
    this.timeout(500);
    var names = [
        'Jacob Andrews', 'Joshua Larkins', 'Tyler Livingston', 'Brandon Macduff', 'Robert Mackenzie',
        'Morgan Gill', 'Rachel White', 'Brooke Timmons', 'Kylie Fraser', 'Stephanie Ralphs'
      ],
      persons = [];

    _.times(10, function(n) {
      persons.push(model.create({
        name: names[n]
      }));
    });

    return Promise
      .all(persons)
      .then(function() {
        return new Promise(function(resolve) {
          setTimeout(resolve, 100);
        });
      })
      .then(function() {
        return model.es.refresh();
      });
  });

  // TODO: При массированном создании документов через create надо долго ждать, когда все создастья и зарефрешиться
  it('search', function() {
    return model.es.client
      .search({
        index: model.es.options.index,
        type: model.es.options.type,
        body: {
          query: {
            bool: {
              must: [{query_string: {default_field: 'name', query: 'ra'}}]
            }
          }
        }
      })
      .then(function(res) {
        res.hits.total.should.be.equal(4);
        res.hits.hits.should.have.length(4);
      });
  });
})
;
