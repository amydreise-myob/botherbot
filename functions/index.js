const functions = require('firebase-functions');
const IncomingWebhook = require('@slack/client').IncomingWebhook;
const _ = require('lodash');

var WebClient = require('@slack/client').WebClient;


// // Create and Deploy Your First Cloud Functions
// // https://firebase.google.com/docs/functions/write-firebase-functions
//
exports.botHandleMessage = functions.https.onRequest((request, response) => {
  if(request.body.challenge) {
    return response.send(request.body.challenge);
  }

  if (request.body.event.type === 'message' && request.body.event.subtype !== 'bot_message') {
    const event = request.body.event;
    const channel = event.channel;

    // channel D---- = dm, C---- = channel G = other
    const isDM = channel.charAt(0) === 'D';
    const mentionsBotherbot = event.text.indexOf('<@U80L6R525>') != -1;

    if (isDM || mentionsBotherbot) {
      var token = functions.config().slack.api_key || ''; //see section above on sensitive data
      var web = new WebClient(token);

      web.chat.postMessage(channel, `Hello there - Welcome to botherbot`, function(err, res) {
          if (err) {
              console.log('Error:', err);
          } else {
              console.log('Message sent: ', res);
          }
      });
    }
    return response.send('not a thing');
  }
  return response.send('not a thing');
});

//
//             {
// "token": "G8eEV6kuLCPls9uHhtbqwQf6",
// "team_id": "T81582F7W",
// "api_app_id": "A817BELTE",
// "event": {
//   "type": "message",
//   "user": "U80J8FFFT",
//   "text": "<@U80L6R525> Hey botherbot",
//   "ts": "1510799281.000165",
//   "channel": "C815VDFMG",
//   "event_ts": "1510799281.000165"
// },
// "type": "event_callback",
// "event_id": "Ev80GBH0EL",
// "event_time": 1510799281,
// "authed_users": [
//   "U80L6R525"
// ]

/*
Posting to slack
 curl -X POST --data-urlencode "payload={\"channel\": \"#pub-lunch\", \"username\": \"webhookbot\", \"text\": \"This is posted to #pub-lunch and comes from a bot named webhookbot.\", \"icon_emoji\": \":ghost:\"}" https://hooks.slack.com/services/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
 */
