/* HTML5 magic
 - GeoLocation
 - WebSpeech
 */

navigator.getUserMedia = navigator.getUserMedia || navigator.webkitGetUserMedia || navigator.mozGetUserMedia;
var peer = new Peer({host: 'codeaddict.me',
    path: '/peerjs',
    secure: true,
    debug: 3
});
peer.on('open', function(){
    $('#my-id').text(peer.id);
});
// Receiving a call
peer.on('call', function(call){
    // Answer the call automatically (instead of prompting user) for demo purposes
    call.answer(window.localStream);
    step3(call);
});
peer.on('error', function(err){
    alert(err.message);
    // Return to step 2 if error occurs
    step2();
});
// Click handlers setup
$(function(){
    $('#make-call').click(function(){
        // Initiate a call!
        var call = peer.call($('#callto-id').val(), window.localStream);
        step3(call);
    });
    $('#end-call').click(function(){
        window.existingCall.close();
        step2();
    });
    // Retry if getUserMedia fails
    $('#step1-retry').click(function(){
        $('#step1-error').hide();
        step1();
    });
    // Get things started
    step1();
});
function step1 () {
    // Get audio/video stream
    navigator.getUserMedia({audio: true, video: true}, function(stream){
        // Set your video displays
        $('#my-video').prop('src', URL.createObjectURL(stream));
        window.localStream = stream;
        step2();
    }, function(){ $('#step1-error').show(); });
}
function step2 () {
    $('#step1, #step3').hide();
    $('#step2').show();
}
function step3 (call) {
    // Hang up on an existing call if present
    if (window.existingCall) {
        window.existingCall.close();
    }
    // Wait for stream on the call, then set peer video display
    call.on('stream', function(stream){
        $('#their-video').prop('src', URL.createObjectURL(stream));
    });
    // UI stuff
    window.existingCall = call;
    $('#their-id').text(call.peer);
    call.on('close', step2);
    $('#step1, #step2').hide();
    $('#step3').show();
}

//WebSpeech API
var final_transcript = '';
var recognizing = false;
var last10messages = []; //to be populated later

if (!('webkitSpeechRecognition' in window)) {
    console.log("webkitSpeechRecognition is not available");
} else {
    var recognition = new webkitSpeechRecognition();
    recognition.continuous = true;
    recognition.interimResults = true;

    recognition.onstart = function() {
        recognizing = true;
    };

    recognition.onresult = function(event) {
        var interim_transcript = '';
        for (var i = event.resultIndex; i < event.results.length; ++i) {
            if (event.results[i].isFinal) {
                final_transcript += event.results[i][0].transcript;
                $('#msg').addClass("final");
                $('#msg').removeClass("interim");
            } else {
                interim_transcript += event.results[i][0].transcript;
                $("#msg").val(interim_transcript);
                $('#msg').addClass("interim");
                $('#msg').removeClass("final");
            }
        }
        $("#msg").val(final_transcript);
    };
}

function startButton(event) {
    if (recognizing) {
        recognition.stop();
        recognizing = false;
        $("#start_button").prop("value", "Record");
        return;
    }
    final_transcript = '';
    recognition.lang = "en-GB"
    recognition.start();
    $("#start_button").prop("value", "Recording ... Click to stop.");
    $("#msg").val();
}
//end of WebSpeech

/*
 Functions
 */
function toggleNameForm() {
    $("#login-screen").toggle();
}

function toggleChatWindow() {
    $("#main-chat-screen").toggle();
}

// Pad n to specified size by prepending a zeros
function zeroPad(num, size) {
    var s = num + "";
    while (s.length < size)
        s = "0" + s;
    return s;
}

// Format the time specified in ms from 1970 into local HH:MM:SS
function timeFormat(msTime) {
    var d = new Date(msTime);
    return zeroPad(d.getHours(), 2) + ":" +
        zeroPad(d.getMinutes(), 2) + ":" +
        zeroPad(d.getSeconds(), 2) + " ";
}

$(document).ready(function() {
    //setup "global" variables first
    var socket = io.connect();
    var myRoomID = null;
    var delay;
    var editor = CodeMirror.fromTextArea(document.getElementById("code"), {
        mode: 'javascript',
        lineNumbers: true,
        lineWrapping: true,
        autoCloseTags: false,
        styleActiveLine: true,
        autoCloseBrackets: false,
        theme: "eclipse"
    });

    $('#mode').change(function(){
        editor.setOption("mode", $(this).val() );

        if(editor.getMode().name == 'htmlmixed'){
            $('iframe').show();
        }
    });
    $('#theme').change(function(){
        editor.setOption("theme", $(this).val() );
    });


    function updatePreview() {
        var previewFrame = document.getElementById('preview');
        var preview =  previewFrame.contentDocument ||  previewFrame.contentWindow.document;
        preview.open();
        preview.write(editor.getValue());
        preview.close();
    }
    setTimeout(updatePreview, 300);
    $("form").submit(function(event) {
        event.preventDefault();
    });

    $("#conversation").bind("DOMSubtreeModified",function() {
        $("#conversation").animate({
            scrollTop: $("#conversation")[0].scrollHeight
        });
    });

    $("#main-chat-screen").hide();
    $("#errors").hide();
    $("#name").focus();
    $("#join").attr('disabled', 'disabled');

    if ($("#name").val() === "") {
        $("#join").attr('disabled', 'disabled');
    }

    //enter screen
    $("#nameForm").submit(function() {
        var name = $("#name").val();
        var device = "desktop";
        if (navigator.userAgent.match(/Android|BlackBerry|iPhone|iPad|iPod|Opera Mini|IEMobile/i)) {
            device = "mobile";
        }
        if (name === "" || name.length < 2) {
            $("#errors").empty();
            $("#errors").append("Please enter a name");
            $("#errors").show();
        } else {
            socket.emit("joinserver", name, device);
            toggleNameForm();
            toggleChatWindow();
            $("#msg").focus();
        }
    });

    $("#name").keypress(function(e){
        var name = $("#name").val();
        if(name.length < 2) {
            $("#join").attr('disabled', 'disabled');
        } else {
            $("#errors").empty();
            $("#errors").hide();
            $("#join").removeAttr('disabled');
        }
    });

    //main chat screen
    $("#chatForm").submit(function() {
        var msg = $("#msg").val();
        if (msg !== "") {
            socket.emit("send", new Date().getTime(), msg);
            $("#msg").val("");
        }
    });

    //'is typing' message
    var typing = false;
    var timeout = undefined;

    function timeoutFunction() {
        typing = false;
        socket.emit("typing", false);
    }

    $("#msg").keypress(function(e){
        if (e.which !== 13) {
            if (typing === false && myRoomID !== null && $("#msg").is(":focus")) {
                typing = true;
                socket.emit("typing", true);
            } else {
                clearTimeout(timeout);
                timeout = setTimeout(timeoutFunction, 5000);
            }
        }
    });

    socket.on("isTyping", function(data) {
        if (data.isTyping) {
            if ($("#"+data.person+"").length === 0) {
                $("#updates").append("<li id='"+ data.person +"'><span class='text-muted'><small><i class='fa fa-keyboard-o'></i> " + data.person + " is typing.</small></li>");
                timeout = setTimeout(timeoutFunction, 5000);
            }
        } else {
            $("#"+data.person+"").remove();
        }
    });


    /*
     $("#msg").keypress(function(){
     if ($("#msg").is(":focus")) {
     if (myRoomID !== null) {
     socket.emit("isTyping");
     }
     } else {
     $("#keyboard").remove();
     }
     });

     socket.on("isTyping", function(data) {
     if (data.typing) {
     if ($("#keyboard").length === 0)
     $("#updates").append("<li id='keyboard'><span class='text-muted'><i class='fa fa-keyboard-o'></i>" + data.person + " is typing.</li>");
     } else {
     socket.emit("clearMessage");
     $("#keyboard").remove();
     }
     console.log(data);
     });
     */

    $("#showCreateRoom").click(function() {
        $("#createRoomForm").toggle();
    });

    $("#createRoomBtn").click(function() {
        var roomExists = false;
        var roomName = $("#createRoomName").val();
        socket.emit("check", roomName, function(data) {
            roomExists = data.result;
            if (roomExists) {
                $("#errors").empty();
                $("#errors").show();
                $("#errors").append("Room <i>" + roomName + "</i> already exists");
            } else {
                if (roomName.length > 0) { //also check for roomname
                    socket.emit("createRoom", roomName);

                    $("#errors").empty();
                    $("#errors").hide();
                    $("#codeForm").show();
                    editor.refresh();
                    editor.focus();
                }
            }
        });
    });

    $("#rooms").on('click', '.joinRoomBtn', function() {
        var roomName = $(this).siblings("span").text();
        var roomID = $(this).attr("id");
        if(socket.room == undefined){
            socket.emit("joinRoom", roomID);
            $("#codeForm").show();
            editor.refresh();
            editor.focus();

        }

    });

    $("#rooms").on('click', '.removeRoomBtn', function() {
        var roomName = $(this).siblings("span").text();
        var roomID = $(this).attr("id");
        socket.emit("removeRoom", roomID);
        $("#createRoom").show();
        $("#codeForm").hide();
    });

    $("#leave").click(function() {
        var roomID = myRoomID;
        socket.emit("leaveRoom", roomID);
        $("#createRoom").show();
        $("#codeForm").hide();
    });

    $("#people").on('click', '.whisper', function() {
        var name = $(this).siblings("span").text();
        $("#msg").val("w:"+name+":");
        $("#msg").focus();
    });
    /*
     $("#whisper").change(function() {
     var peopleOnline = [];
     if ($("#whisper").prop('checked')) {
     console.log("checked, going to get the peeps");
     //peopleOnline = ["Tamas", "Steve", "George"];
     socket.emit("getOnlinePeople", function(data) {
     $.each(data.people, function(clientid, obj) {
     console.log(obj.name);
     peopleOnline.push(obj.name);
     });
     console.log("adding typeahead")
     $("#msg").typeahead({
     local: peopleOnline
     }).each(function() {
     if ($(this).hasClass('input-lg'))
     $(this).prev('.tt-hint').addClass('hint-lg');
     });
     });

     console.log(peopleOnline);
     } else {
     console.log('remove typeahead');
     $('#msg').typeahead('destroy');
     }
     });
     // $( "#whisper" ).change(function() {
     //   var peopleOnline = [];
     //   console.log($("#whisper").prop('checked'));
     //   if ($("#whisper").prop('checked')) {
     //     console.log("checked, going to get the peeps");
     //     peopleOnline = ["Tamas", "Steve", "George"];
     //     // socket.emit("getOnlinePeople", function(data) {
     //     //   $.each(data.people, function(clientid, obj) {
     //     //     console.log(obj.name);
     //     //     peopleOnline.push(obj.name);
     //     //   });
     //     // });
     //     //console.log(peopleOnline);
     //   }
     //   $("#msg").typeahead({
     //         local: peopleOnline
     //       }).each(function() {
     //         if ($(this).hasClass('input-lg'))
     //           $(this).prev('.tt-hint').addClass('hint-lg');
     //       });
     // });
     */

//socket-y stuff
    socket.on('refresh', function (data) {
        editor.setValue(data);
    });
    socket.on('change', function (data) {
        console.log(data);
        editor.replaceRange(data.text, data.from, data.to);
    });
    editor.on('change', function (i, op) {
        console.log(op);
        socket.emit('change', op);
        socket.emit('refresh', editor.getValue());
        if(editor.getMode().name == 'htmlmixed'){
            clearTimeout(delay);
            delay = setTimeout(updatePreview, 300);
        }

    });
    socket.on("exists", function(data) {
        $("#errors").empty();
        $("#errors").show();
        $("#errors").append(data.msg + " Try <strong>" + data.proposedName + "</strong>");
        toggleNameForm();
        toggleChatWindow();
    });

    socket.on("joined", function() {
        $("#errors").hide();
    });

    socket.on("history", function(data) {
        if (data.length !== 0) {
            $("#msgs").append("<li><strong><span class='text-warning'>Last 10 messages:</li>");
            $.each(data, function(data, msg) {
                $("#msgs").append("<li><span class='text-warning'>" + msg + "</span></li>");
            });
        } else {
            $("#msgs").append("<li><strong><span class='text-warning'>No past messages in this room.</li>");
        }
    });

    socket.on("update", function(msg) {
        $("#msgs").append("<li>" + msg + "</li>");
    });

    socket.on("update-people", function(data){
        //var peopleOnline = [];
        $("#people").empty();
        $('#people').append("<li class=\"list-group-item active\">People online <span class=\"badge\">"+data.count+"</span></li>");
        $.each(data.people, function(a, obj) {
            $('#people').append("<li class=\"list-group-item\"><span>" + obj.name + "</span> <i class=\"fa fa-"+obj.device+"\"></i> <a href=\"#\" class=\"whisper btn btn-xs\">whisper</a></li>");
            //peopleOnline.push(obj.name);
        });

        /*var whisper = $("#whisper").prop('checked');
         if (whisper) {
         $("#msg").typeahead({
         local: peopleOnline
         }).each(function() {
         if ($(this).hasClass('input-lg'))
         $(this).prev('.tt-hint').addClass('hint-lg');
         });
         }*/
    });

    socket.on("chat", function(msTime, person, msg, color) {
        $("#msgs").append("<li><strong><span class='text-success'>" + timeFormat(msTime) + "</span></strong><span style='color:" + color + "'>" + person.name + "</span>: " + msg + "</li>");
        //clear typing field
        $("#"+person.name+"").remove();
        clearTimeout(timeout);
        timeout = setTimeout(timeoutFunction, 0);
    });

    socket.on("whisper", function(msTime, person, msg) {
        if (person.name === "You") {
            s = "whisper to " + person.to;
        } else {
            s = " whispers"
        }
        $("#msgs").append("<li><strong><span class='text-muted'>" + timeFormat(msTime) + person.name + s + "</span></strong>: " + msg + "</li>");
    });

    socket.on("roomList", function(data) {
        $("#rooms").text("");
        $("#rooms").append("<li class=\"list-group-item active\">List of rooms <span class=\"badge\">"+data.count+"</span></li>");
        if (!jQuery.isEmptyObject(data.rooms)) {
            $.each(data.rooms, function(id, room) {
                var html = "<button id="+id+" class='joinRoomBtn btn btn-default btn-xs' >Join</button>" + " " + "<button id="+id+" class='removeRoomBtn btn btn-default btn-xs'>Remove</button>";
                $('#rooms').append("<li id="+id+" class=\"list-group-item\"><span>" + room.name + "</span> " + html + "</li>");
            });
        } else {
            $("#rooms").append("<li class=\"list-group-item\">There are no rooms yet.</li>");
        }
    });

    socket.on("sendRoomID", function(data) {
        myRoomID = data.id;
    });

    socket.on("disconnect", function(){
        $("#msgs").append("<li><strong><span class='text-warning'>The server is not available</span></strong></li>");
        $("#msg").attr("disabled", "disabled");
        $("#send").attr("disabled", "disabled");
    });

});
