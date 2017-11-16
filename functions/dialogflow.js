'use strict';

const functions = require('firebase-functions'); // Cloud Functions for Firebase library
const DialogflowApp = require('actions-on-google').DialogflowApp; // Google Assistant helper library

const googleAssistantRequest = 'google'; // Constant to identify Google Assistant requests

const _ = require('lodash');

const admin = require('firebase-admin');
admin.initializeApp(functions.config().firebase);

const IncomingWebhook = require('@slack/client').IncomingWebhook;
const WebClient = require('@slack/client').WebClient;


exports.dialogflowFirebaseFulfillment = functions.https.onRequest((request, response) => {
  console.log('Request headers: ' + JSON.stringify(request.headers));
  console.log('Request body: ' + JSON.stringify(request.body));

  // An action is a string used to identify what needs to be done in fulfillment
  let action = request.body.result.action; // https://dialogflow.com/docs/actions-and-parameters

  // Parameters are any entites that Dialogflow has extracted from the request.
  const parameters = request.body.result.parameters; // https://dialogflow.com/docs/actions-and-parameters

  // Contexts are objects used to track and store conversation state
  const inputContexts = request.body.result.contexts; // https://dialogflow.com/docs/contexts

  // Get the request source (Google Assistant, Slack, API, etc) and initialize DialogflowApp
  const requestSource = (request.body.originalRequest) ? request.body.originalRequest.source : undefined;
  const app = new DialogflowApp({request: request, response: response});

  // Create handlers for Dialogflow actions as well as a 'default' handler
  const actionHandlers = {
    // The default welcome intent has been matched, welcome the user (https://dialogflow.com/docs/events#default_welcome_intent)
    'input.welcome': () => {
      // Use the Actions on Google lib to respond to Google requests; for other requests use JSON
      if (requestSource === googleAssistantRequest) {
        sendGoogleResponse('Hello, Welcome to my Dialogflow agent!'); // Send simple response to user
      } else {
        sendResponse('Hello, Welcome to my Dialogflow agent!'); // Send simple response to user
      }
    },
    // The default fallback intent has been matched, try to recover (https://dialogflow.com/docs/intents#fallback_intents)
    'input.unknown': () => {
      // Use the Actions on Google lib to respond to Google requests; for other requests use JSON
      if (requestSource === googleAssistantRequest) {
        sendGoogleResponse('I\'m having trouble, can you try that again?'); // Send simple response to user
      } else {
        sendResponse('I\'m having trouble, can you try that again?'); // Send simple response to user
      }
    },
    'havebooked': () => {
      let responseToUser = {
        speech: request.body.result.fulfillment.speech, // spoken response
        displayText: request.body.result.fulfillment.speech // displayed response
      };
      sendResponse(responseToUser);
    },
    'notbooked': () => {
      let responseToUser = {
        speech: request.body.result.fulfillment.speech, // spoken response
        displayText: request.body.result.fulfillment.speech // displayed response
      };
      sendResponse(responseToUser);
    },
    'vote': () => {
      // Use the Actions on Google lib to respond to Google requests; for other requests use JSON

      response = handleVote(request);
      let responseToUser = {
        //richResponses: richResponses, // Optional, uncomment to enable
        //outputContexts: [{'name': 'weather', 'lifespan': 2, 'parameters': {'city': 'Rome'}}], // Optional, uncomment to enable
        speech: response, // spoken response
        displayText: response // displayed response
      };
      sendResponse(responseToUser);
    },
    // Default handler for unknown or undefined actions
    'default': () => {
      // Use the Actions on Google lib to respond to Google requests; for other requests use JSON
      if (requestSource === googleAssistantRequest) {
        let responseToUser = {
          //googleRichResponse: googleRichResponse, // Optional, uncomment to enable
          //googleOutputContexts: ['weather', 2, { ['city']: 'rome' }], // Optional, uncomment to enable
          speech: 'This message is from Dialogflow\'s Cloud Functions for Firebase editor!', // spoken response
          displayText: 'This is from Dialogflow\'s Cloud Functions for Firebase editor! :-)' // displayed response
        };
        sendGoogleResponse(responseToUser);
      } else {
        let responseToUser = {
          //richResponses: richResponses, // Optional, uncomment to enable
          //outputContexts: [{'name': 'weather', 'lifespan': 2, 'parameters': {'city': 'Rome'}}], // Optional, uncomment to enable
          speech: request.body.result.fulfillment.speech, // spoken response
          displayText: request.body.result.fulfillment.speech // displayed response
        };
        sendResponse(responseToUser);
      }
    }
  };

  // If undefined or unknown action use the default handler
  if (!actionHandlers[action]) {
    action = 'default';
  }

  // Run the proper handler function to handle the request from Dialogflow
  actionHandlers[action]();

  // Function to send correctly formatted Google Assistant responses to Dialogflow which are then sent to the user
  function sendGoogleResponse (responseToUser) {
    if (typeof responseToUser === 'string') {
      app.ask(responseToUser); // Google Assistant response
    } else {
      // If speech or displayText is defined use it to respond
      let googleResponse = app.buildRichResponse().addSimpleResponse({
        speech: responseToUser.speech || responseToUser.displayText,
        displayText: responseToUser.displayText || responseToUser.speech
      });

      // Optional: Overwrite previous response with rich response
      if (responseToUser.googleRichResponse) {
        googleResponse = responseToUser.googleRichResponse;
      }

      // Optional: add contexts (https://dialogflow.com/docs/contexts)
      if (responseToUser.googleOutputContexts) {
        app.setContext(...responseToUser.googleOutputContexts);
      }

      app.ask(googleResponse); // Send response to Dialogflow and Google Assistant
    }
  }

  // Function to send correctly formatted responses to Dialogflow which are then sent to the user
  function sendResponse (responseToUser) {
    // if the response is a string send it as a response to the user
    if (typeof responseToUser === 'string') {
      let responseJson = {};
      responseJson.speech = responseToUser; // spoken response
      responseJson.displayText = responseToUser; // displayed response
      response.json(responseJson); // Send response to Dialogflow
    } else {
      // If the response to the user includes rich responses or contexts send them to Dialogflow
      let responseJson = {};

      // If speech or displayText is defined, use it to respond (if one isn't defined use the other's value)
      responseJson.speech = responseToUser.speech || responseToUser.displayText;
      responseJson.displayText = responseToUser.displayText || responseToUser.speech;

      // Optional: add rich messages for integrations (https://dialogflow.com/docs/rich-messages)
      responseJson.data = responseToUser.richResponses;

      // Optional: add contexts (https://dialogflow.com/docs/contexts)
      responseJson.contextOut = responseToUser.outputContexts;

      response.json(responseJson); // Send response to Dialogflow
    }
  }
});



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
    const mentionsBotherbot = event.text.indexOf('<@U80L6R525>') !== -1;

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
  }
});

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
    response.send(message);
  })
});

const handleVote = (request) => {
  const user = request.body.user;
  const option = request.body.option;

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
};

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

      response.send('The votes are in! This week we\'re headed to ' + pubName + '.'
          + ' ' + booker + ' is in charge of booking.');
    });
  });
});

exports.nag = functions.https.onRequest((request, response) => {
  admin.database().ref('surveys/' + getWeek()).once('value', data => {
    const survey = data.val();

    if (!survey.booked) {
      return response.send('Get to booking, ' + survey.booker);
    }

    response.send('ok');
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
