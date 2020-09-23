const chai = require('chai')
const expect = chai.expect
const sinon = require('sinon')
const sinonChai = require('sinon-chai')
const {
  ddbAssertions
} = require('./lib/ddb-test-utils')
chai.use(ddbAssertions)
chai.use(sinonChai)

const AwsMocker = require('aws-sdk-mock')
const ddbEventStore = require('../src/index')

const ddbClientGetStub = sinon.stub()
const ddbClientQueryStub = sinon.stub()
const ddbClientTransactWriteStub = sinon.stub()

const aggregateTypeName = 'TestAggregate'
const aggregateId = 'testAggInstance1'

describe.only('ddb-event-store', function () {
  let eventStore

  before(() => {
    AwsMocker.mock('DynamoDB.DocumentClient', 'get', ddbClientGetStub)
    AwsMocker.mock('DynamoDB.DocumentClient', 'query', ddbClientQueryStub)
    AwsMocker.mock('DynamoDB.DocumentClient', 'transactWrite', ddbClientTransactWriteStub)

    const tableName = 'ddb-table'
    const ddbClient = require('./fixtures/ddb-client')

    eventStore = ddbEventStore({ tableName, ddbClient })
  })

  afterEach(() => {
    ddbClientGetStub.reset()
    ddbClientQueryStub.reset()
    ddbClientTransactWriteStub.reset()
  })

  it('Writes events successfully', () => {
    // stub out the database reads to make sure they fail
    ddbClientGetStub.returns(null)
    ddbClientQueryStub.returns(null)
    // stub out the database write to return with success
    ddbClientTransactWriteStub.callsArgWith(1, null, {})

    const events = [
      {
        eventName: 'EventType1',
        payload: {
          EventType1Prop: 'value-for-event-type-1'
        }
      },
      {
        eventName: 'EventType2',
        payload: {
          EventType2Prop: 'value-for-event-type-2'
        }
      }
    ]

    return eventStore.put(aggregateTypeName, aggregateId, 0, events)
      .then(record => {
        expect(record).to.have.property('version')
        expect(record).to.have.property('aggregateTypeName', aggregateTypeName)
        expect(record).to.have.property('aggregateId', aggregateId)
      })
  })

  it('Will not violate optimistic lock contraint', () => {
    // stub out the database reads to make sure they fail
    ddbClientGetStub.returns(null)
    ddbClientQueryStub.returns(null)
    // stub out the database write to fail with a TransactionCanceledException error
    const tError = new Error()
    tError.name = 'TransactionCanceledException'
    ddbClientTransactWriteStub.callsArgWith(1, tError, {})

    const events = [
      {
        eventName: 'EventType3',
        payload: {
          EventType1Prop: 'value-for-event-type-3'
        }
      },
      {
        eventName: 'EventType4',
        payload: {
          EventType2Prop: 'value-for-event-type-4'
        }
      }
    ]

    return eventStore.put(aggregateTypeName, aggregateId, 0, events)
      .catch(err => {
        expect(err.name).to.match(/TransactionCanceledException/)
        const { TransactItems: transactItems } = ddbClientTransactWriteStub.firstCall.args[0]
        //console.log(JSON.stringify(transactItems, null, 2))
        expect(transactItems).to.have.length(3)
        const aggregateRootUpdate = transactItems.find(isUpdatesAggregateRootRecord)
        expect(aggregateRootUpdate).to.not.equal(-1)
        expect(aggregateRootUpdate.Put).to.have.property('ConditionExpression')
      })
  })

  it('Correctly Retrieves aggregate info and events', () => {
    const items = [
      {
        PK: `${aggregateTypeName}#${aggregateId}`,
        SK: `${aggregateTypeName}#${aggregateId}`
      },
      {
        eventName: 'EventType3',
        payload: {
          EventType1Prop: 'value-for-event-type-3'
        }
      },
      {
        eventName: 'EventType4',
        payload: {
          EventType2Prop: 'value-for-event-type-4'
        }
      }
    ]
    // stub out the database query to return items
    ddbClientQueryStub.callsArgWith(1, null, { Count: items.length, Items: items })

    return eventStore.get(aggregateTypeName, aggregateId)
      .then(aggregateRootRecord => {
        expect(aggregateRootRecord).to.have.property('aggregate')
        expect(aggregateRootRecord).to.have.property('events')
      })
  })
})

const isUpdatesAggregateRootRecord = ({
  Put: {TableName, ConditionExpression, Item:{PK, SK}, UpdateExpression, ExpresstionAttributeVallues}
}) => new RegExp(`^${aggregateTypeName}#${aggregateId}\$`).test(PK)
