'use strict';

var _ = require('lodash');

module.exports = BulkCollector;

function BulkCollector(agent, max_size, max_time) {
  this.max_size = max_size || 1000;
  this.max_time = max_time || 1500;

  if (!agent)
    throw new TypeError('Agent: Elasticsearch client is required');

  this.agent = agent;
  this.defer = Promise.defer();
  this.promise = this.defer.promise;
  this.isBoiling = false;
  this.collection = [];

  this.makeAlarm();
}

BulkCollector.prototype.makeAlarm = function() {
  var self = this;

  setTimeout(function() {
    self.boil(true);
  }, this.max_time);
};

BulkCollector.prototype.isEmpty = function() {
  return !this.collection.length;
};

BulkCollector.prototype.isFull = function() {
  return this.max_size === this.collection.length;
};

BulkCollector.prototype.boil = function(from_alarm) {
  var self = this;

  // if is empty?

  if (self.isEmpty() && from_alarm)
    return this.makeAlarm();

  if (self.isBoiling)
    return self.promise;

  self.isBoiling = true;

  self.agent
    .bulk(self.getQueries())
    .then(function(response) {
      if (response.status < 200 || response.status > 299)
        throw new Error(response.error);

      self.resolveQueries(response.items);
      self.defer.resolve(response);
    })
    .catch(function(reason) {
      self.defer.reject(reason);
      self.rejectQueries(reason);
    });

  return this.promise;
};

BulkCollector.prototype.resolveQueries = function(response_items) {
  var self = this;

  response_items.forEach(function(item, index) {
    var action
      , result;

    item = _.pairs(item)[0];

    action = item[0];
    result = item[1];

    if (self.collection[index]) {
      if (result.status < 200 || result.status > 299)
        self.collection[index].defer.reject(result.error);
      else
        self.collection[index].defer.resolve(result);
    }
  });
};

BulkCollector.prototype.rejectQueries = function(reason) {
  var self = this;

  self.collection.forEach(function(item) {
    item.defer.reject(reason);
  });
};

BulkCollector.prototype.push = function(action) {
  if (this.isBoiling)
    throw new Error('Collector is boiling');

  var defer = Promise.defer();

  this.collection.push({
    query: action,
    defer: defer
  });

  if (this.isFull())
    this.boil();

  return defer.promise;
};

BulkCollector.prototype.getQueries = function() {
  return this.collection.reduce(function(accum, item) {
    return accum.concat(item.query);
  }, []);
};
