'use strict';

/**
 * @fileOverview Description file.
 * @author <a href="mailto:ma.chetverikov@gmail.com">Maksim Chetverikov</a>
 */

var mongoose = require('mongoose')
  , me = require('./lib');

var schema = new mongoose.Schema({});

schema.plugin(me);

mongoose.model('www', schema);

var model = mongoose.model('www');

