/*
let params;

window.addEventListener("load", (e) => {
    pushInfoToCallback();
});

async function postData(url = '', data = {}) {
    const response = await fetch(url, {
        method: 'POST',
        mode: 'cors',
        cache: 'no-cache',
        headers: {
        'Content-Type': 'application/json'
        },
        redirect: 'manual',
        referrerPolicy: 'no-referrer',
        body: JSON.stringify(data)
    });
    return response;
}

async function pushToCallback() {
    //retreive data here...
    let data = {
        username: username.value,
        password: sha256(password.value),
        state: state,
        redirect_uri: redirect_uri,
        code_challenge: code_challenge,
        code_challenge_method: code_challenge_method
    }

    try {
        await postData('/oauth2callback', data)
        .then((res) => {
            if (res.status != 200)
                throw "error";

            res.json().then(data => {
                let url = data.redirect_uri;
                window.location.href = url
                //consider replacing here..
            });
        });
    }
    catch (err) {
        console.log(err);
        //tell user that u fuckup your credential
    }
}

async function postData(url = '', data = {}) {
    const response = await fetch(url, {
        method: 'POST',
        mode: 'cors',
        credentials: 'same-origin',
        cache: 'no-cache',
        headers: {
        'Content-Type': 'application/json',
        },
        redirect: 'manual',
        referrerPolicy: 'no-referrer',
        body: JSON.stringify(data)
    });
    return response;
}
*/