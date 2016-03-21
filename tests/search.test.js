'use strict';

/**
 * @author <a href="mailto:ma.chetverikov@gmail.com">Maksim Chetverikov</a>
 */

var support = require('./support')
  , plugin = require('./../lib')
  , mongoose = require('mongoose');

require('should')

/* eslint max-nested-callbacks:0 */
/* eslint require-jsdoc:0 */
describe.skip('Search', function() {

  var model;

  before(() => support.mongoose_connect());
  before(function() {
    var schema = require('./support/schema');

    schema.plugin(plugin, {
      middleware: false
    });

    model = conn.model(support.random() + '_DocumentSearch', schema);

    return model.es.createIndex();
  });

  after(() => support.removeAndClose(model));

  describe('search', function() {

  });
});
