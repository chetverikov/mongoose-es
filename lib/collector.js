'use strict';

const pairs = require('lodash.pairs');

class BulkCollector {
  constructor(agent, max_size, max_time) {
    if (!agent) {
      throw new TypeError('Agent: Elasticsearch client is required');
    }

    this.max_size = max_size || 1000;
    this.max_time = max_time || 1500;

    this.agent = agent;
    this.defer = Promise.defer();
    this.promise = this.defer.promise;
    this.isBoiling = false;
    this.collection = [];

    this.makeAlarm();
  }

  makeAlarm() {
    setTimeout(() => this.boil(true), this.max_time);
  }

  isEmpty() {
    return !this.collection.length;
  }

  isFull() {
    return this.max_size === this.collection.length;
  }

  boil(from_alarm) {
    // if is empty?
    if (this.isEmpty() && from_alarm) {
      return this.makeAlarm();
    }

    if (this.isBoiling) {
      return this.promise;
    }

    this.isBoiling = true;

    this.agent
      .bulk(this.getQueries())
      .then(response => {
        if (response.status < 200 || response.status > 299) {
          throw new Error(response.error);
        }

        this.resolveQueries(response.items);
        this.defer.resolve(response);
      })
      .catch(reason => {
        this.defer.reject(reason);
        this.rejectQueries(reason);
      });

    return this.promise;
  }

  resolveQueries(response_items) {
    response_items.forEach((item, index) => {
      item = pairs(item)[0];

      const result = item[1];

      if (this.collection[index]) {
        if (result.status < 200 || result.status > 299) {
          this.collection[index].defer.reject(result.error);
        } else {
          this.collection[index].defer.resolve(result);
        }
      }
    });
  }

  rejectQueries(reason) {
    this.collection.forEach(item => item.defer.reject(reason));
  }

  push(query) {
    if (this.isBoiling) {
      throw new Error('Collector is boiling');
    }

    var defer = Promise.defer();

    this.collection.push({
      query,
      defer
    });

    if (this.isFull()) {
      this.boil();
    }

    return defer.promise;
  }

  getQueries() {
    return this.collection.reduce((accum, item) => accum.concat(item.query), []);
  }
}

module.exports = BulkCollector;
