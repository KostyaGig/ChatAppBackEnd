const express = require('express'); //requires express module
const socket = require('socket.io'); //requires socket.io module
const crypto = require('crypto'); // for uuid

const fs = require('fs');
const app = express();

var PORT = process.env.PORT || 3000;
const server = app.listen(PORT);

app.use(express.static('public'));
console.log('Server is running');
const io = socket(server);


var userId = 0 ;
var users = [];
var messages = [];

var offlineUserNotificationTokens = [];

// base uri - http://10.0.2.2:3000

io.on('connection', (socket) => {

    console.log("connection " + socket.id)

    socket.on('join_user', (clientUser) => {
        var user = Object();
        userId++;
        user.id = userId;
        user.nickname = clientUser.nickname;
        users.push(user)

        io.emit('join_user',userId)
    })


    socket.on('send_message', (clientMessage) => {
        console.log('sendMessage')
        var message = Object();
        var messageId = crypto.randomUUID();
        var senderId = clientMessage.senderId;

        message.id = messageId;
        message.senderId = senderId;
        message.content = clientMessage.content;
        message.isRead = false;
        message.senderNickName = clientMessage.senderNickName;
        messages.push(message)

        io.emit('messages',messages)

        console.log("send message ",message)

        sendNotification(message.id,message.senderNickName,message.content)
    })

    const functions = require("firebase-functions");
    var admin = require("firebase-admin");
    var serviceAccount = require("/Users/kostazinovev/Desktop/chat_firebase_key.json");

    if (!admin.apps.length) {
        admin.initializeApp({
            credential: admin.credential.cert(serviceAccount)
        });
    }

    function sendNotification(messageId,senderNickName,content) {


        offlineUserNotificationTokens.forEach(function(item, index, array) {
            var notificationToken = item

            const message = {
                data: {
                    messageId: messageId,
                    nickName: senderNickName,
                    content: content
                },
                token: notificationToken
            };

            admin.messaging().send(message)
                .then((response) => {
                    console.log('Successfully sent message:', response);
                })
                .catch((error) => {
                    console.log('Error sending message:', error);
                });
        })

    }


    socket.on('messages', () => {
        io.emit('messages',messages)
    })

    socket.on('edit_message',(clientMessage) => {
        var id = clientMessage.id;
        var content = clientMessage.content;
        var indexEditingContentMessage = -1;
        var newMessage = Object();

        messages.forEach(function(item, index, array) {
            if (item.id == id) {

                newMessage.id = item.id;
                newMessage.senderId = item.senderId
                newMessage.content = content;
                newMessage.senderNickName = item.senderNickName;

                // todo if was updated change isRead -> false
                newMessage.isRead = false


                indexEditingContentMessage = index;
            }
        });

        messages[indexEditingContentMessage] = newMessage;


        io.emit('messages',messages)

    })

    socket.on('read_message',(messageIds) => {
        var jsonIds = JSON.parse(messageIds)['ids'];
        if (typeof jsonIds[0] !== 'undefined') {
            var indexMessageForUpdate = -1;
            var newMessage = Object();
            jsonIds.forEach(function(messageId, index, array) {
                messages.forEach(function(message, messageIndex, array) {
                    if (message.id == messageId) {

                        newMessage.id = message.id;
                        newMessage.senderId = message.senderId;
                        newMessage.content = message.content;
                        newMessage.senderNickName = message.senderNickName;
                        newMessage.isRead = true;

                        indexMessageForUpdate = messageIndex;
                    }
                });
            });
            console.log("read",newMessage);

            messages[indexMessageForUpdate] = newMessage;

            io.emit('messages',messages)
        }
    })


    socket.on('disconnect_user',(notificationToken) => {

        var token = notificationToken['notification_token']
        offlineUserNotificationTokens.push(token)

        console.log('disconnectUser',offlineUserNotificationTokens)
    })

    socket.on('connect_user',(notificationToken) => {
        var token = notificationToken['notification_token']
        var indexOf = offlineUserNotificationTokens.indexOf(token)

        if (indexOf > -1) {
            offlineUserNotificationTokens.splice(indexOf,1)
        }

        console.log('connectUser',offlineUserNotificationTokens)
    })


    var isTypingYet = false

    socket.on('to_type_message',(message) => {
        var objectMessage = Object()
        var isTyping = message['isTyping']
        var senderNickName = message['senderNickName']

        objectMessage.senderNickName = senderNickName

        if (isTyping) {
            if(isTypingYet == false) {
                objectMessage.isTyping = true
                isTypingYet = true
                io.emit('to_type_message',objectMessage)
                console.log('push',objectMessage)
            }
        } else {
            if(isTypingYet == true) {
                objectMessage.isTyping = false
                isTypingYet = false
                io.emit('to_type_message',objectMessage)
                console.log('push',objectMessage)
            }
        }
    })

    socket.on('show_notification_message',(message) => {
        var id = message['messageId']
        console.log('notif msg id ',id,message)
    })


    var MongoClient = require('mongodb').MongoClient;
    var url = "mongodb://localhost:27017/";


    socket.on('testAddSenderIdAndReceiverId',(user) => {
        console.log(user)
        // var jsonUser = JSON.parse(user)
        // console.log(jsonUser)
        // console.log(user['senderId'],user['receiverId'])

        var senderId = user['senderId']
        var receiverId = user['receiverId']

        MongoClient.connect(url, function(err, db) {
            if (err) throw err;
            var database = db.db("chat_app_db");
            var user = {
                senderId: senderId,
                receiverId: receiverId,
                msg: [
                    { senderName: 'Petya', content: 'Hello,Kostya' },
                    { senderName: 'Kostya', content: 'Hello,Petya' }
                ]}

            database.collection("user").insertOne(user, function(err, res) {
                if (err) throw err;
                console.log("1 document inserted");
                db.close();
            });

        });
    })

    socket.on('testUpdateSenderIdAndReceiverId',(user) => {
        console.log(user)
        // var jsonUser = JSON.parse(user)
        // console.log(jsonUser)
        // console.log(user['senderId'],user['receiverId'])

        var senderId = user['senderId']
        var receiverId = user['receiverId']
        var newMsg = user['messages']

        var jsonNewMsg = {
            msg: newMsg
        }

        MongoClient.connect(url, function(err, db) {
            if (err) throw err;
            var database = db.db("chat_app_db");

            var query = {
                senderId: senderId,
                receiverId: receiverId,
            }

            var newMessages = { $set: jsonNewMsg}

            database.collection("user").updateOne(query,newMessages, function(err, res) {
                if (err) throw err;
                console.log("1 document inserted");
                db.close();
            });

        });
    })

    socket.on('testReadSenderIdAndReceiverId',(user) => {
        var senderId = user['senderId']
        var receiverId = user['receiverId']

        MongoClient.connect(url, function(err, db) {
            if (err) throw err;
            var database = db.db("chat_app_db");

            var user = {
                senderId: senderId,
                receiverId: receiverId
            }

            database.collection("user").findOne(user, function(err, result) {
                if (err) throw err;
                console.log('msg',result['msg']);
                db.close();
            });

        });
    })


    socket.on('testSendMessage',(message) => {
        console.log(message)

        var senderId = message['senderId']
        var receiverId = message['receiverId']

        MongoClient.connect(url, function(err, db) {
            if (err) throw err;
            var database = db.db("chat_app_db");

            var user = {
                senderId: senderId,
                receiverId: receiverId
            }

            database.collection("user").findOne(user, function(err, result) {
                if (err) throw err;
                var jsonFoundMessages = result['msg']
                var listOfMessages = [];

                console.log('Print messages')

                // copy old messages to list
                jsonFoundMessages.forEach(function(message) {
                    var messageObject = Object();
                    messageObject.senderName = message.senderName;
                    messageObject.content = message.content;
                    listOfMessages.push(messageObject);
                });

                // add new message to list after coped old messages to there
                var newMessage = Object();
                newMessage.senderName = message['senderName'];
                newMessage.content = message['content'];

                listOfMessages.push(newMessage)

                // query for update messages
                var query = {
                    senderId: senderId,
                    receiverId: receiverId,
                }

                var jsonMessages = {
                    msg: listOfMessages
                }

                var newMessages = { $set: jsonMessages}

                database.collection("user").updateOne(query,newMessages, function(err, res) {
                    if (err) throw err;
                    console.log("1 document inserted");
                    db.close();
                });

            });

        });
    })


})



