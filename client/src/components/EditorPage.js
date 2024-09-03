import React, { useEffect, useRef, useState } from "react";
import Client from "./Client";
import Editor from "./Editor";
import { initSocket } from "../Socket";
import { ACTIONS } from "../Actions";
import { useNavigate, useLocation, Navigate, useParams } from "react-router-dom";
import { toast } from "react-hot-toast";
import axios from "axios"; // Import Axios for HTTP requests

function EditorPage() {
  const [clients, setClients] = useState([]);
  const [output, setOutput] = useState(""); // State to manage compilation output
  const codeRef = useRef(""); // Initialize with an empty string

  const location = useLocation(); // Changed variable name to lowercase
  const navigate = useNavigate();
  const { roomId } = useParams();

  const socketRef = useRef(null);

  // JDoodle API constants
  const JDoodle_API_URL = "https://cors-anywhere.herokuapp.com/https://api.jdoodle.com/v1/execute";
  const CLIENT_ID = "f00ae9dece81ff4d8ec46df2dbc95a20"; // Replace wijth your JDoodle client ID
  const CLIENT_SECRET = "f93ae99b855942566defd382d903754db46973690fefad1c522b934ec198b341"; // Replace with your JDoodle client secret

  useEffect(() => {
    const init = async () => {
      socketRef.current = await initSocket();
      socketRef.current.on("connect_error", handleErrors);
      socketRef.current.on("connect_failed", handleErrors);

      function handleErrors(err) {
        console.log("Error", err);
        toast.error("Socket connection failed, Try again later");
        navigate("/");
      }

      socketRef.current.emit(ACTIONS.JOIN, {
        roomId,
        username: location.state?.username,
      });

      // Listen for new clients joining the chatroom
      socketRef.current.on(ACTIONS.JOINED, ({ clients, username, socketId }) => {
        if (username !== location.state?.username) {
          toast.success(`${username} joined the room.`);
        }
        setClients(clients);
        // Send the code to sync
        socketRef.current.emit(ACTIONS.SYNC_CODE, {
          code: codeRef.current,
          socketId,
        });
      });

      // Listening for disconnected
      socketRef.current.on(ACTIONS.DISCONNECTED, ({ socketId, username }) => {
        toast.success(`${username} left the room`);
        setClients((prev) => {
          return prev.filter((client) => client.socketId !== socketId);
        });
      });
    };

    init();

    // Cleanup
    return () => {
      if (socketRef.current) {
        socketRef.current.disconnect();
        socketRef.current.off(ACTIONS.JOINED);
        socketRef.current.off(ACTIONS.DISCONNECTED);
      }
    };
  }, [location.state?.username, navigate, roomId]);

  if (!location.state) {
    return <Navigate to="/" />;
  }

  const copyRoomId = async () => {
    try {
      await navigator.clipboard.writeText(roomId);
      toast.success("Room ID is copied");
    } catch (error) {
      console.log(error);
      toast.error("Unable to copy the Room ID");
    }
  };

  const leaveRoom = () => {
    navigate("/");
  };

  // Compile Code function
  const compileCode = async () => {
    try {
      const response = await axios.post(
        JDoodle_API_URL,
        {
          clientId: CLIENT_ID,
          clientSecret: CLIENT_SECRET,
          script: codeRef.current, // Code from the editor
          stdin: "", // Any input to the program, if needed
          language: "cpp17", // For C++
          versionIndex: "0", // Version index for the chosen language
          compileOnly: false, // Set to true if you only want to compile, not execute
        },
        {
          headers: {
            "Content-Type": "application/json",
          },
        }
      );

      const { output, statusCode, memory, cpuTime } = response.data;
      if (statusCode === 200) {
        setOutput(`Output:\n${output}\nMemory: ${memory}\nCPU Time: ${cpuTime}`);
      } else {
        setOutput(`Compilation failed with status code: ${statusCode}`);
      }
    } catch (error) {
      console.error("Error during code compilation:", error);
      setOutput(`Error: ${error.message}`);
    }
  };

  return (
    <div className="container-fluid vh-100">
      <div className="row h-100">
        {/* Client panel */}
        <div
          className="col-md-2 bg-dark text-light d-flex flex-column h-100"
          style={{ boxShadow: "2px 0px 4px rgba(0, 0, 0, 0.1)" }}
        >
           <h5 className="text-center my-3">Collaborative Code Room</h5>
           <hr style={{ marginTop: "-1rem" }} />

          {/* Client list container */}
          <div className="d-flex flex-column flex-grow-1 overflow-auto">
            <span className="mb-2">Members</span>
            {clients.map((client) => (
              <Client key={client.socketId} username={client.username} />
            ))}
          </div>

          <hr />
          {/* Buttons */}
          <div className="mt-auto">
            <button className="btn btn-success" onClick={copyRoomId}>
              Copy Room ID
            </button>
            <button
              className="btn btn-danger mt-2 mb-2 px-3 btn-block"
              onClick={leaveRoom}
            >
              Leave Room
            </button>
          </div>
        </div>

        {/* Editor panel */}
        <div className="col-md-10 text-light d-flex flex-column h-100">
          <Editor
            socketRef={socketRef}
            roomId={roomId}
            onCodeChange={(code) => {
              codeRef.current = code;
            }}
          />
          {/* Compile Button */}
          <button className="btn btn-primary mt-2" onClick={compileCode}>
            Compile Code
          </button>
          {/* Output Section */}
          {output && (
            <div className="mt-3 p-3 bg-light text-dark">
              <h5>Compilation Output:</h5>
              <pre>{output}</pre>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default EditorPage;
