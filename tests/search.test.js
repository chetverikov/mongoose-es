'use strict';

/**
 * @author <a href="mailto:ma.chetverikov@gmail.com">Maksim Chetverikov</a>
 */

var support = require('./support')
  , plugin = require('./../lib')
  , conn = support.mongoose_connect();

require('should')

describe.skip('Search', function() {

  var model;

  before(function() {
    var schema = require('./support/schema');

    schema.plugin(plugin, {
      middleware: false
    });

    model = conn.model(support.random() + '_DocumentSearch', schema);

    return model.es.createIndex();
  });

  after(function() {
    return support
      .removeCreatedIndexByModel(model)
      .then(function() {
        conn.close();
      });
  });

  describe('search', function() {

  });
});
