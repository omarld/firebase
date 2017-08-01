const functions = require('firebase-functions');
const admin = require('firebase-admin');
admin.initializeApp(functions.config().firebase);


exports.addMessage = functions.https.onRequest((req, res) => {
    // Grab the text parameter.
    const original = req.query.text;
    // Push the new message into the Realtime Database using the Firebase Admin SDK.
    admin.database().ref('/messages').push({original: original}).then(snapshot => {
        // Redirect with 303 SEE OTHER to the URL of the pushed object in the Firebase console.
        res.redirect(303, snapshot.ref);
    });
});

// Listens for new messages added to /messages/:pushId/original and creates an
// uppercase version of the message to /messages/:pushId/uppercase
exports.makeUppercase = functions.database.ref('/messages/{pushId}/original')
.onWrite(event => {
    const original = event.data.val();
    console.log('Uppercasing', event.params.pushId, original);
    const uppercase = original.toUpperCase();
    return event.data.ref.parent.child('uppercase').set(uppercase);
});

/**
**/
exports.insertStylistTimeSlot = functions.database.ref('/appointments/stylist/{uid}/{date}/{uuid}').onWrite(event => {
    const stylistUid = event.params.uid;
    const date = event.params.date;

    console.log("Stylist ID: " + stylistUid + " - For Date: " + date);

    if(event.data.val()){
        const appt = event.data.val();
        console.log('Appointment is: ' + JSON.stringify(appt))

        if(appt && appt.time){
            admin.database().ref(`/timeslots/${stylistUid}/${date}/`).push(appt.time);
            return;
        }
    } else {
        console.log('No data found to write to Time Slots.');
    }
});


/**
* Triggers when a user gets a new follower and sends a notification.
*
* Followers add a flag to `/followers/{followedUid}/{followerUid}`.
* Users save their device notification tokens to `/users/{followedUid}/notificationTokens/{notificationToken}`.
*/
exports.sendFollowerNotification = functions.database.ref('/appointments/{clientUid}/{barberUid}').onWrite(event => {
    const clientUid = event.params.clientUid;
    const barberUid = event.params.barberUid;

    // If un-follow we exit the function.
    if (!event.data.val()) {
        return console.log('Client ', clientUid, ' un-followed Barber ', barberUid);
    }
    console.log('We have a new Client UID:', clientUid, ' for barber:', barberUid);

    // Get the list of device notification tokens.
    return admin.database().ref(`/barbers/${barberUid}/notificationTokens`).once('value').then(
        snapshot => {
            const tokensSnapshot = snapshot.val().notificationToken;
            // Check if there are any device tokens.
            if (!tokensSnapshot) {
                return console.log('There are no notification tokens to send to.');
            }

            console.log("Sending notification to token STRINGIFY: " + JSON.stringify(tokensSnapshot));
            console.log("Sending notification to token: " + tokensSnapshot);
            // Notification details.
            const payload = {
                notification: {
                    title: 'You have a new appointment!',
                    body: "Test is now following you."
                }
            };
            // Send notifications to all tokens.
            // const tokens = [tokensSnapshot]
            return admin.messaging().sendToDevice(tokensSnapshot, payload).then(response => {
                // For each message check if there was an error.
                const tokensToRemove = [];
                response.results.forEach((result, index) => {
                    const error = result.error;
                    if (error) {
                        console.error('Failure sending notification to', tokens[index], error);
                        // Cleanup the tokens who are not registered anymore.
                        if (error.code === 'messaging/invalid-registration-token' ||
                        error.code === 'messaging/registration-token-not-registered') {
                            tokensToRemove.push(tokensSnapshot.ref.child(tokens[index]).remove());
                        }
                    }
                });
                return Promise.all(tokensToRemove);
            });
        }
    );
});
