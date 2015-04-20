'use strict';

/**
 * @fileOverview Description file.
 * @author <a href="mailto:ma.chetverikov@gmail.com">Maksim Chetverikov</a>
 */
var MongooseES = require('./plugin');

module.exports = function(schema, options) {
  return new MongooseES(schema, options);
};
