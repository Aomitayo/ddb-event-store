# ddb-event-store
An implementation of an event store on dynamodb.

An event store is supposed to be provide an append only log of events for a
given entity. It is a fundamental abstraction in event sourced systems.

This nodejs package implements this abstraction on top of Aws dynamodb.

## getting started
```
npm install ddb-event-store
```

Inside some contrived event sourced system you would do things like
```
import Aws from "aws-sdk";
import ddbEventStore from "ddb-event-store";

const ddbClient = new Aws.DynamoDB.DocumentClient({
  region: "us-east-1",
  apiVersion: "2012-08-10",
  ...ddbEndpoint
});
const ddbTableName = "MyDdbTable";

const eventStore = ddbEventStore({
  tableName: ddbTableName,
  ddbClient: ddbClient
});

// to retrieve the event for an "Order" with id "1"
eventStore.get("Order", "1").then(({events}) => {
  //work with the ordered sequence of events here
});

//to append events to the event log for thee "Order" with id "2"
eventStore.put(
    "Order",
    "2",
    0,
    [
      {
        eventName: "OrderPlaced",
        payload: {
         datePlaced: "2018-01-01"
         productSku: "Potatoes1234"
        }
      }
    ]
  ).then(() => {
    // do something after success
  });]

```
