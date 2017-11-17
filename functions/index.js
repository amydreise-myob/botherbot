const _ = require('lodash');

const functions = require('firebase-functions');
const admin = require('firebase-admin');
admin.initializeApp(functions.config().firebase);

const IncomingWebhook = require('@slack/client').IncomingWebhook;
const WebClient = require('@slack/client').WebClient;

var apiai = require('apiai');
var app = apiai("d5280deb7e45489880f94d53dd859661");
var token = functions.config().slack.api_key || ''; //see section above on sensitive data
var web = new WebClient(token);

const uuidv4 = require('uuid/v4');

exports.botHandleMessage = functions.https.onRequest((request, response) => {
  console.log('handleMessage', request.body);
  if(request.body.challenge) {
    return response.send(request.body.challenge);
  }
  if (request.body.event.type === 'message' && request.body.event.subtype !== 'bot_message') {
    const event = request.body.event;
    const channel = event.channel;
    const userId = event.user;

    // channel D---- = dm, C---- = channel G = other
    const isDM = channel.charAt(0) === 'D';
    const mentionsBotherbot = event.text.indexOf('<@U80L6R525>') !== -1;
    if (isDM || mentionsBotherbot) {
      const request = app.textRequest(event.text, {
        sessionId: uuidv4(),
      });
      request.on('response', function(res) {
        const text = res.result.fulfillment.displayText;
        const messages = res.result.fulfillment.messages[0].speech;

        var reply = text || res.result.fulfillment.messages[0].speech;
        var opts = {};

        if (res.result.action === 'vote' && res.result.parameters.pub) {
          handleVote(userId, res.result.parameters.pub);
        }
        if (res.result.action === 'result') {
          reply = getResults();
        }
        if (res.result.action === 'whattosay') {
          reply = 'Wimp. Here you go.';
          opts = {
            attachments: [{
              fallback: 'Booking',
              text: 'https://storage.googleapis.com/botherbot-186223.appspot.com/translate_tts.mp3'
            }]
          }
        }
        sendMessage(channel, reply, opts);
        return response.send('ok');
      });

      request.on('error', function(error) {
          console.log('error', error);
          return response.send('ok');
      });
      request.end();
    }
  } else {
    return response.send('ok');
  }
});

const getResults = () => {
  admin.database().ref('surveys/' + getWeek()).once('value', data => {
    const pubs = {};
    data.forEach(d => {
      pubs[d.key] = d.child('name').val();
    });
    console.log(pubs);
    const message = 'It\'s that time of the week! Where does everyone want to go for pub lunch on Friday?'
    + ' Your options are '
    + _.values(pubs).join(', ').replace(/,(?!.*,)/gmi, ' and')
    + '.'
    return message;
  });
}

exports.startSurvey = functions.https.onRequest((request, response) => {
  admin.database().ref('pubs').once('value', data => {
    const pubs = {};
    data.forEach(d => {
      pubs[d.key] = d.child('name').val();
    });
    admin.database().ref('surveys/' + getWeek()).set({
      ts: new Date().toTimeString(),
      pubs: pubs,
      votes: {},
      booked: false,
    });
    const message = 'It\'s that time of the week! Where does everyone want to go for pub lunch on Friday?'
    + ' Your options are '
    + _.values(pubs).join(', ').replace(/,(?!.*,)/gmi, ' and')
    + '.'
    sendMessage('#pub-lunch', message);
    return response.send('ok');
  });
});

const sendMessage = (channel, message, opts) => {
  opts = opts || {};
  web.chat.postMessage(channel, message,
    Object.assign({}, {icon_emoji: ':hamburger:', username: 'LunchBot'}, opts),
    function(err, res) {
    if (err) {
        console.log('Error:', err);
    } else {
      console.log('Message sent: ', res);
    }
    return;
  });
}

 const handleVote = (user, option) => {
  // find the pub's id
  admin.database().ref('surveys/' + getWeek() + '/pubs').once('value', data => {
    const pubs = data.val();
    let realName;
    let vote;
    _.forOwn(pubs, (name, id) => {
      if (name.toLowerCase() === option.toLowerCase()) {
        realName = name;
        vote = id;
      }
    });

    if (!vote) {
      return 'Sorry, that\'s not one of your options.';
    }

    admin.database().ref('surveys/' + getWeek() + '/votes/' + user).set(vote);
    return 'That\'s one more for ' + realName + '!';
  })
}

exports.stopSurvey = functions.https.onRequest((request, response) => {
  admin.database().ref('surveys/' + getWeek() + '/votes').once('value', data => {
    const votes = data.val();
    const counts = {};

    // figure out winner
    _.forOwn(votes, (pub, user) => {
      counts[pub] = counts[pub] ? _.concat(counts[pub], user) : [user];
    });

    let winner;
    let voters;
    let max = 0;

    _.forOwn(counts, (votes, pub) => {
      if (votes.length > max) {
        max = votes.length;
        winner = pub;
        voters = votes;
      }
    });

    // choose a booker
    const booker = voters[Math.floor(Math.random() * voters.length)];

    admin.database().ref('surveys/' + getWeek() + '/winner').set(winner);
    admin.database().ref('surveys/' + getWeek() + '/booker').set(booker);

    admin.database().ref('pubs/' + winner + '/name').once('value', data => {
      const pubName = data.val();
      sendMessage('#pub-lunch', 'The votes are in! This week we\'re headed to ' + pubName + '.'
      + ' <@' + booker + '> is in charge of booking.');
      return response.send('ok');
    });
  });
});

exports.nag = functions.https.onRequest((request, response) => {
  admin.database().ref('surveys/' + getWeek()).once('value', data => {
    const survey = data.val();

    if (!survey.booked) {
      sendMessage(survey.booker, 'Get to booking, <@' + survey.booker + '>');
      return response.send('ok');
    } else {
      return response.send('ok');
    }
  });
});

exports.handleBooked = functions.https.onRequest((request, response) => {
  admin.database().ref('surveys/' + getWeek() + '/booked').set(true);
  response.send('ok');
});

getWeek = function() {
  const now = new Date();
  const onejan = new Date(now.getFullYear(),0,1);
  const millisecsInDay = 86400000;
  return Math.ceil((((now - onejan) /millisecsInDay) + onejan.getDay()+1)/7).toString();
};

// {
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

  // admin.database().ref('pubs/meatdistrict').set({
  //   name: 'Meat District',
  //   website: 'https://www.meatdistrictco.com.au/'
  // });
  // admin.database().ref('pubs/lordnelson').set({
  //   name: 'Lord Nelson',
  //   website: 'https://www.lordnelsonbrewery.com/'
  // });
  // admin.database().ref('pubs/cargobar').set({
  //   name: 'Cargo Bar',
  //   website: 'https://cargobar.com.au/'
  // });
  // admin.database().ref('pubs/smallbar').set({
  //   name: 'Small Bar',
  //   website: 'http://www.smallbar.net.au/erskine-street/'
  // });

/*
Posting to slack
 curl -X POST --data-urlencode "payload={\"channel\": \"#pub-lunch\", \"username\": \"webhookbot\", \"text\": \"This is posted to #pub-lunch and comes from a bot named webhookbot.\", \"icon_emoji\": \":ghost:\"}" https://hooks.slack.com/services/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
 */
