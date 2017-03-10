'use strict';

/**
 * @fileOverview Description file.
 * @author <a href="mailto:ma.chetverikov@gmail.com">Maksim Chetverikov</a>
 */

const mongoose = require('mongoose');

delete require.cache[__filename]; // For new schema object on each require

module.exports = new mongoose.Schema({
  name: String,
  phones: [String],
  extra: {
    one: Number,
    two: Number
  }
});
