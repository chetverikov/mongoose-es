'use strict';

const pairs = require('lodash.pairs');
const Bulk = require('./bulk');

class BulkCollector {
  constructor(agent, max_size, max_time) {
    if (!agent) {
      throw new TypeError('Agent: Elasticsearch client is required');
    }

    this.max_size = max_size || 1000;
    this.max_time = max_time || 1500;

    this.agent = agent;
    this.bulks = [];
  }

  push(query) {
    if (!this.bulks[0] || this.bulks[0].promise) {
      this.bulks.unshift(new Bulk(this.agent, this.max_size, this.max_time));
    }

    return this.bulks[0].push(query);
  }

  executed() {
    return Promise.all(this.bulks);
  }

  isEmpty() {
    return !this.bulks.length;
  }
}

module.exports = BulkCollector;
