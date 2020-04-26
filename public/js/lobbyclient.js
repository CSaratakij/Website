let serviceHost = "http://localhost:8080";
let app;
let store = {
    title: "Game Lobby",
    total: 0,
    createDate: "",
    lobby: []
}

let source;
let isDisconnectOnce = false;

window.addEventListener("load", () => {
    initialize();
    subscribe();
});

function subscribe() {
    let hookURL = serviceHost + "/subscribe";
    source = new EventSource(hookURL);

    source.onopen = event => {
        if (event.data == undefined) return;
        let data = JSON.parse(event.data)

        if (!isDisconnectOnce) return;
        if (data.createDate == undefined) return;

        let isMiss = isCacheMiss(store.createDate, data.createDate);

        if (isMiss) {
            fetchGameLobby();
        }

        isDisconnectOnce = false;

        Swal.fire({
            icon: 'success',
            title: 'Online',
            text: 'Reconnect successful',
        });

        // console.log("Receive ping respond event... : " + JSON.stringify(data));
    }

    source.onmessage = event => {
        try {
            let data = JSON.parse(event.data);

            switch (data.event) {
                case "add-lobby":
                {
                    store.lobby.push(data);
                    store.total += 1;

                    // console.log("Receive add lobby event... : " + JSON.stringify(data));
                }
                break;
                
                case "update-lobby":
                {
                    let id = data.id;
                    let index = store.lobby.findIndex(element => id == element.id);

                    if (index > -1) {
                        Vue.set(store.lobby, index, data);
                    }

                    // console.log("Receive update lobby event... : " + JSON.stringify(data));
                }
                break;

                case "remove-lobby":
                {
                    let id = data.id;
                    let index = store.lobby.findIndex(element => id == element.id);

                    if (index > -1) {
                        Vue.delete(store.lobby, index);
                        store.total -= 1;
                    }
                    else {
                        console.log("Not found id : " + id);
                    }

                    // console.log("Receive delete lobby event... : " + JSON.stringify(data));
                }
                break;

                default:
                    break;
            }
        }
        catch (err) {
            console.log(err);
        }
    }

    source.onerror = event => {
        if (isDisconnectOnce) return;
        isDisconnectOnce = true;

        let alertConfig =  {
            icon: 'error',
            title: 'Offline',
            text: 'Connection has been closed',
            confirmButtonText: 'Refresh',
            showLoaderOnConfirm: true,
            allowOutsideClick: false,
            preConfirm: () => {
                return fetch(serviceHost + "/lobby")
                .then(response => {
                    if (!response.ok) {
                        throw new Error(response.statusText);
                    }
                    return response.json();
                })
                .catch(err => {
                    Swal.showValidationMessage(
                        'connection timeout...'
                    )
                })
            }
        }

        Swal.fire(alertConfig).then(result => {
            if (result.value) {
                initializeView(result.value);
                Swal.fire({
                    icon: 'success',
                    title: 'Online',
                    text: 'Reconnect successful',
                });
            }
        });
    }
}

function initialize() {
    fetchGameLobby();

    app = new Vue({
        el: "#app",
        data: store,
        methods: {
            reRender: function() {
                this.forceUpdate();
            },
            localeDate: function() {
                if (this.createDate == undefined) return "";
                let date = new Date(this.createDate);
                return date.toLocaleString();
            },
            removeLobby: function(id) {
                Vue.delete(this.lobby, id);
                this.total -= 1;
            }
        }
    });
}

function fetchGameLobby() {
    fetch(serviceHost + "/lobby")
        .then(response => {
            if (response.status !== 200) {
                console.log(
                    "Looks like there was a problem. Status Code: " +
                        response.status
                );
                return;
            }
            response.json().then(data => {
                initializeView(data);
            });
        })
        .catch(err => {
            console.log("Fetch Error :-S", err);
        });
}

function initializeView(data) {
    store.createDate = data.createDate;
    store.total = data.total;
    store.lobby.splice(0, store.lobby.length);

    Object.keys(data.lobby).forEach((key) => {
        let value = data.lobby[key];
        store.lobby.push(value);
    });
}

function isCacheMiss(current, expect) {
    let cacheDate = new Date(current);
    let reportDate = new Date(expect);

    let isSameDate = cacheDate.getTime() == reportDate.getTime();
    return !isSameDate;
}
