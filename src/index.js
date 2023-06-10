/**
 * This module provides an event store implemention on top of dynamodb.
 * The event store supports 2 operations:
 * 1. Event Retreival {@link get}
 * 2. Event logging {@link put}
 *
 * In general, we adhere to the notion of an event-log as an append-only log of
 * domain events for a given aggregate root. So we have the signatures of the
 * event store functions being:
 *
 * get:: (aggregateTypeName:String, aggregateId:String) -> Promise<EventLog>
 * put:: (aggregateTypeName, aggregateId, currentAggregateVersion, events) -> Promise<AggregateRootRecord>
 *
 * EventLog is an object with the structure:
 *
 * @typedef EventLog
 * @property {AggregateRootRecord} aggregate
 * @property {Array<Object>} events
 *
 * @typedef AggregateRootRecord
 * @property {string} aggregateTypeName
 * @property {string} aggregateId
 * @property {number} version
 * @property {ISO8601DateString} lastUpdate
 *
 * @typedef Event
 * @property {String} eventName
 * @property {String} eventTime
 *
 *
 * Essentially, the event store is a Dynamodb table with one item representing an
 * {@link AggregateRootRecord} for each aggregate root instance, and one item for
 * each domain event.
 * The Dynamodb Primary key(partition and sort key), and Secondary key formats for AggregateRootRecords and
 * Events are as follows:
 *
 * AggregateRootRecord Item:
 *  Partition key: ``<aggregateTypeName>#<aggregateId>``
 *  Sort Key: ``<aggregateTypeName>#<aggregateId>``
 *  GSI1PK: None
 *  GSI1SK: None
 *
 * Event Item:
 *  Partition key: ``<aggregateTypeName>#<aggregateId>``
 *  Sort Key: ``#<aggregateTypeName>#<aggregateId>#<AggregateVersion>#<EventIndex>``
 *  GSI1PK: ``<aggregateTypeName>#<aggregateId> ``
 *  GSI1SK: ``<event time>#<eventName>``
 *
 */
const { ulid } = require('ulid');

const aggregateResults = (aggregateTypeName, aggregateId) =>
  ({ Count: count, Items: items }) => {
    // console.log('returned from db', items)
    return count > 0
      ? { aggregate: { ...(items.slice(-1)[0]), aggregateId }, events: items.slice(0, -1) }
      : { aggregate: { version: 0, versionUlid: ulid(0), aggregateTypeName, aggregateId }, events: [] };
  };

module.exports = ({ tableName, ddbClient }) => ({
  get: async (aggregateTypeName, aggregateId) => {
    const query = ddbClient.query({
      TableName: tableName,
      KeyConditionExpression: 'PK = :pk and SK <= :sk',
      ExpressionAttributeValues: {
        ':pk': `${aggregateTypeName}#${aggregateId}`,
        ':sk': `${aggregateTypeName}#${aggregateId}`
      },
      ScanIndexForward: true
    });
    if (typeof query.promise === 'function') {
      return query.promise().then(aggregateResults(aggregateTypeName, aggregateId));
    } else {
      return query.then(aggregateResults(aggregateTypeName, aggregateId));
    }
  },
  put: (aggregateTypeName, aggregateId, currentAggregateVersion, events) => {
    const nextAggregateVersion = currentAggregateVersion + 1;
    const nextAggregateVersionUlid = ulid(nextAggregateVersion);
    const transactItems = ([
      {
        Put: {
          TableName: tableName,
          ConditionExpression: '(version = :currentVersion) or attribute_not_exists(SK)',
          Item: {
            PK: `${aggregateTypeName}#${aggregateId}`,
            SK: `${aggregateTypeName}#${aggregateId}`,
            __aggregateTypeName: aggregateTypeName,
            aggregateId,
            version: nextAggregateVersion,
            versionUlid: nextAggregateVersionUlid,
            lastUpdate: new Date().toISOString()
          },
          UpdateExpression: {

          },
          ExpressionAttributeValues: {
            ':currentVersion': currentAggregateVersion
          },
          ReturnValuesOnConditionCheckFailure: 'ALL_OLD'
        }
      }
    ]).concat(events.map(({ eventName, eventTime, ...eventAttribs }, eventIndex) => {
      return {
        Put: {
          TableName: tableName,
          Item: {
            PK: `${aggregateTypeName}#${aggregateId}`,
            SK: `#${aggregateTypeName}#${aggregateId}#${nextAggregateVersionUlid}#${eventIndex}`,
            GSI1PK: `${aggregateTypeName}#${aggregateId}`,
            GSI1SK: `${eventName}#${eventTime || new Date().toISOString()}`,
            __version: nextAggregateVersion,
            __versionUlid: nextAggregateVersionUlid,
            __eventName: eventName,
            eventName,
            ...eventAttribs
          }
        }
      };
    }));

    const query = ddbClient.transactWrite({
      TransactItems: transactItems
    });

    if (typeof query.promise === 'function') {
      return query.promise().then(() => ({ version: nextAggregateVersion, aggregateId, aggregateTypeName }));
    } else {
      return query.then(() => ({ version: nextAggregateVersion, aggregateId, aggregateTypeName }));
    }
  }
});
