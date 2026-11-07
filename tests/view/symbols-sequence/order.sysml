// order: 縦の順(頭の中の事象の間の継承と、メッセージの間の継承)
package P {
    occurrence def Exchange {
        part producer {
            event occurrence pubSent;
        }
        part server {
            event occurrence subReceived;
            then event occurrence pubReceived;
            then event occurrence delivered;
        }
        part consumer {
            event occurrence subSent;
            then event occurrence deliveryReceived;
        }
        message publish from producer.pubSent to server.pubReceived;
        message subscribe from consumer.subSent to server.subReceived;
        message deliver from server.delivered to consumer.deliveryReceived;
        message ack from server.delivered to producer.pubSent;
        first deliver then ack;
    }
}
