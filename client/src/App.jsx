import React, { useEffect, useRef, useState } from "react";
import * as Y from "yjs";
import { WebsocketProvider } from "y-websocket";
import { IndexeddbPersistence } from "y-indexeddb";
import { EditorState, Plugin } from "prosemirror-state";
import { EditorView } from "prosemirror-view";
import { Schema } from "prosemirror-model";
import { baseKeymap, toggleMark, setBlockType } from "prosemirror-commands";
import { keymap } from "prosemirror-keymap";
import { ySyncPlugin, yCursorPlugin, yUndoPlugin, undo as yUndo, redo as yRedo } from "y-prosemirror";
import {
  Users,
  FileText,
  Undo2,
  Redo2,
  Download,
  Share2,
  Bold,
  Italic,
  Underline,
  Check,
  Copy,
  ExternalLink,
  X,
  Plus,
  LogOut,
  User,
  MessageSquare,
  Bot,
  Sparkles,
  History,
  Wifi,
  WifiOff,
  RefreshCw,
  HardDrive,
  Sun,
  Moon,
} from "lucide-react";
import VersionHistoryDrawer from "./components/VersionHistoryDrawer.jsx";
import VersionDiffModal from "./components/VersionDiffModal.jsx";
import VersionPreviewBanner from "./components/VersionPreviewBanner.jsx";
import AiWritingAssistant from "./components/AiWritingAssistant.jsx";
import ChatPanel from "./components/ChatPanel.jsx";

// ProseMirror schema
const editorSchema = new Schema({
  nodes: {
    doc: { content: "block+" },
    paragraph: {
      group: "block",
      content: "inline*",
      attrs: { align: { default: null } },
      parseDOM: [{ tag: "p" }],
      toDOM(node) {
        const attrs = {};
        if (node.attrs.align) attrs.style = `text-align: ${node.attrs.align}`;
        return ["p", attrs, 0];
      },
    },
    heading: {
      group: "block",
      content: "inline*",
      attrs: { level: { default: 1 } },
      defining: true,
      parseDOM: [
        { tag: "h1", attrs: { level: 1 } },
        { tag: "h2", attrs: { level: 2 } },
        { tag: "h3", attrs: { level: 3 } },
      ],
      toDOM(node) {
        return [`h${node.attrs.level}`, 0];
      },
    },
    text: { group: "inline" },
  },
  marks: {
    strong: {
      parseDOM: [{ tag: "strong" }, { tag: "b" }],
      toDOM: () => ["strong", 0],
    },
    em: {
      parseDOM: [{ tag: "i" }, { tag: "em" }],
      toDOM: () => ["em", 0],
    },
    underline: {
      parseDOM: [{ tag: "u" }],
      toDOM: () => ["u", 0],
    },
  },
});

const RANDOM_ADJECTIVES = ["Smart", "Creative", "Brilliant", "Quick", "Clever", "Swift", "Bright"];
const RANDOM_ANIMALS = ["Fox", "Eagle", "Wolf", "Lion", "Bear", "Falcon", "Otter"];
const COLOR_PALETTE = [
  "#2563EB", "#7C3AED", "#DB2777", "#EA580C",
  "#059669", "#0891B2", "#4F46E5", "#D97706"
];

function getRandomUser() {
  const adj = RANDOM_ADJECTIVES[Math.floor(Math.random() * RANDOM_ADJECTIVES.length)];
  const animal = RANDOM_ANIMALS[Math.floor(Math.random() * RANDOM_ANIMALS.length)];
  const color = COLOR_PALETTE[Math.floor(Math.random() * COLOR_PALETTE.length)];
  return {
    name: `${adj} ${animal}`,
    color,
  };
}

function buildCursor(user) {
  const cursor = document.createElement("span");
  cursor.className = "cursor";
  cursor.style.borderLeft = `2px solid ${user.color}`;
  cursor.style.position = "relative";
  cursor.style.marginLeft = "-1px";
  cursor.style.height = "1.2em";
  cursor.style.display = "inline-block";

  const label = document.createElement("div");
  label.textContent = user.name;
  label.style.position = "absolute";
  label.style.top = "-24px";
  label.style.backgroundColor = user.color;
  label.style.color = "white";
  label.style.padding = "2px 6px";
  label.style.borderRadius = "4px";
  label.style.fontSize = "11px";
  label.style.fontWeight = "600";
  label.style.whiteSpace = "nowrap";
  label.style.pointerEvents = "none";
  label.style.zIndex = "1000";
  label.style.boxShadow = "0 2px 4px rgba(0,0,0,0.15)";

  cursor.appendChild(label);
  return cursor;
}

function buildSelection(user) {
  return { style: `background-color: ${user.color}25` };
}

export default function App() {
  // Current user state (persisted in localStorage)
  const [currentUser, setCurrentUser] = useState(() => {
    try {
      const saved = localStorage.getItem("dastavez_user");
      return saved ? JSON.parse(saved) : null;
    } catch {
      return null;
    }
  });

  const [loginNameInput, setLoginNameInput] = useState("");
  const [selectedColor, setSelectedColor] = useState(COLOR_PALETTE[0]);

  // Editor refs & state
  const editorRef = useRef(null);
  const viewRef = useRef(null);
  const providerRef = useRef(null);
  const idbRef = useRef(null);
  const metadataMapRef = useRef(null);

  const [connectedUsers, setConnectedUsers] = useState(new Map());
  const [docTitle, setDocTitle] = useState("Untitled Document");
  const [isConnected, setIsConnected] = useState(false);
  const [connectionStatus, setConnectionStatus] = useState("syncing"); // 'online' | 'syncing' | 'offline'
  const [syncMessage, setSyncMessage] = useState("");
  const [lastSyncedTime, setLastSyncedTime] = useState(null);
  const [isIdbLoaded, setIsIdbLoaded] = useState(false);
  const [, setTimeTick] = useState(0);
  const [userCount, setUserCount] = useState(0);
  const [zoomLevel, setZoomLevel] = useState(100);

  // Helper function to format last synced time
  const formatLastSynced = (date) => {
    if (!date) return "Never";
    const now = new Date();
    const diffSec = Math.max(0, Math.floor((now - date) / 1000));
    if (diffSec < 10) return "Just now";
    if (diffSec < 60) return `${diffSec}s ago`;
    const diffMin = Math.floor(diffSec / 60);
    if (diffMin < 60) return `${diffMin}m ago`;
    const diffHour = Math.floor(diffMin / 60);
    if (diffHour < 24) return `${diffHour}h ago`;
    return date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  };

  // Re-render relative time every 10 seconds
  useEffect(() => {
    const interval = setInterval(() => {
      setTimeTick((t) => t + 1);
    }, 10000);
    return () => clearInterval(interval);
  }, []);

  // Document room & sharing
  const [currentDocId, setCurrentDocId] = useState("default-room");
  const [copied, setCopied] = useState(false);
  const [shareModalOpen, setShareModalOpen] = useState(false);
  const [toastMessage, setToastMessage] = useState(null);

  // Version History State
  const [historyDrawerOpen, setHistoryDrawerOpen] = useState(false);
  const [versionsList, setVersionsList] = useState([]);
  const [loadingVersions, setLoadingVersions] = useState(false);
  const [activePreviewVersion, setActivePreviewVersion] = useState(null);
  const [diffModalOpen, setDiffModalOpen] = useState(false);
  const [diffVersionA, setDiffVersionA] = useState(null);
  const [diffVersionB, setDiffVersionB] = useState(null);
  const [restoring, setRestoring] = useState(false);

  // AI Writing Assistant State
  const [aiAssistantOpen, setAiAssistantOpen] = useState(false);
  const [chatPanelOpen, setChatPanelOpen] = useState(false);
  const [theme, setTheme] = useState(() => localStorage.getItem("dastavez_theme") || "dark");

  useEffect(() => {
    if (theme === "dark") {
      document.documentElement.classList.add("dark");
    } else {
      document.documentElement.classList.remove("dark");
    }
    localStorage.setItem("dastavez_theme", theme);
  }, [theme]);
  const [selectionInfo, setSelectionInfo] = useState({
    hasSelection: false,
    text: "",
    range: null,
    coords: null,
    context: "",
  });
  const aiAssistantOpenRef = useRef(false);
  aiAssistantOpenRef.current = aiAssistantOpen;

  const fetchVersions = async () => {
    setLoadingVersions(true);
    try {
      const res = await fetch(`http://localhost:1234/api/documents/${currentDocId}/versions`);
      if (res.ok) {
        const data = await res.json();
        setVersionsList(data);
      }
    } catch (e) {
      console.error("Failed to fetch versions:", e);
    } finally {
      setLoadingVersions(false);
    }
  };

  useEffect(() => {
    if (currentDocId) {
      fetchVersions();
    }
  }, [currentDocId]);

  // Read URL room parameter on mount
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const room = params.get("doc") || params.get("room") || "default-room";
    setCurrentDocId(room);

    // Sync URL if missing ?doc=
    if (!params.get("doc") && !params.get("room")) {
      const url = new URL(window.location.href);
      url.searchParams.set("doc", room);
      window.history.replaceState(null, "", url.toString());
    }
  }, []);

  // Handle Login submission
  const handleStartEditing = (e) => {
    e?.preventDefault();
    const finalName = loginNameInput.trim() || getRandomUser().name;
    const userObj = { name: finalName, color: selectedColor };
    localStorage.setItem("dastavez_user", JSON.stringify(userObj));
    setCurrentUser(userObj);
  };

  const handleSignOut = () => {
    localStorage.removeItem("dastavez_user");
    setCurrentUser(null);
  };

  // Setup Yjs, IndexedDB, WebSocket & ProseMirror
  useEffect(() => {
    if (!editorRef.current || !currentUser) return;

    let isMounted = true;
    let syncMessageTimer = null;

    // Clean up previous instances if existing
    if (viewRef.current) {
      viewRef.current.destroy();
      viewRef.current = null;
    }
    if (providerRef.current) {
      providerRef.current.destroy();
      providerRef.current = null;
    }
    if (idbRef.current) {
      idbRef.current.destroy();
      idbRef.current = null;
    }

    const ydoc = new Y.Doc();

    // 1. Local Persistence: IndexedDB via y-indexeddb
    const idbProvider = new IndexeddbPersistence(currentDocId, ydoc);
    idbRef.current = idbProvider;

    // 2. Real-time Synchronization: WebSocket Provider
    const wsUrl = "ws://localhost:1234";
    const provider = new WebsocketProvider(wsUrl, currentDocId, ydoc);
    providerRef.current = provider;

    const yXmlFragment = ydoc.getXmlFragment("prosemirror");
    const metadataMap = ydoc.getMap("metadata");
    metadataMapRef.current = metadataMap;

    // Title synchronization
    if (metadataMap.has("title")) {
      setDocTitle(String(metadataMap.get("title")));
    }
    const handleMetadataChange = (event) => {
      if (event.keysChanged.has("title")) {
        setDocTitle(String(metadataMap.get("title") || "Untitled Document"));
      }
    };
    metadataMap.observe(handleMetadataChange);

    // Initial IndexedDB sync callback
    idbProvider.on("synced", () => {
      if (!isMounted) return;
      setIsIdbLoaded(true);
      if (metadataMap.has("title")) {
        setDocTitle(String(metadataMap.get("title") || "Untitled Document"));
      }
      setLastSyncedTime((prev) => prev || new Date());
    });

    // Awareness: user identity
    provider.awareness.setLocalStateField("user", {
      name: currentUser.name,
      color: currentUser.color,
      cursor: null,
    });

    // Unified Connection and Sync Status Manager
    const updateSyncState = (wsStatus, isSynced) => {
      if (!isMounted) return;

      const online = typeof navigator !== "undefined" && navigator.onLine;

      if (!online || wsStatus === "disconnected") {
        setConnectionStatus("offline");
        setIsConnected(false);
        setSyncMessage("");
      } else if (wsStatus === "connecting") {
        setConnectionStatus("syncing");
        setIsConnected(false);
        setSyncMessage("Syncing changes...");
      } else if (wsStatus === "connected") {
        setIsConnected(true);
        if (isSynced) {
          setConnectionStatus("online");
          setSyncMessage("All changes synced");
          setLastSyncedTime(new Date());

          if (syncMessageTimer) clearTimeout(syncMessageTimer);
          syncMessageTimer = setTimeout(() => {
            if (isMounted) setSyncMessage("");
          }, 3000);
        } else {
          setConnectionStatus("syncing");
          setSyncMessage("Syncing changes...");
        }
      }
    };

    provider.on("status", ({ status }) => {
      updateSyncState(status, provider.synced);
    });

    provider.on("sync", (isSynced) => {
      if (provider.wsconnected) {
        updateSyncState("connected", isSynced);
      }
    });

    // Browser Online/Offline detection
    const handleOnline = () => {
      if (!isMounted) return;
      setConnectionStatus("syncing");
      setSyncMessage("Syncing changes...");
      if (provider && !provider.wsconnected) {
        provider.connect();
      }
    };

    const handleOffline = () => {
      if (!isMounted) return;
      setConnectionStatus("offline");
      setIsConnected(false);
      setSyncMessage("");
    };

    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);

    // Check initial browser online state
    if (typeof navigator !== "undefined" && !navigator.onLine) {
      setConnectionStatus("offline");
      setIsConnected(false);
    }

    // Awareness updates
    provider.awareness.on("change", () => {
      try {
        const states = provider.awareness.getStates();
        const users = new Map();

        states.forEach((state, clientId) => {
          if (state.user && clientId !== provider.awareness.clientID) {
            users.set(clientId, {
              name: state.user.name,
              color: state.user.color,
              cursor: state.cursor?.anchor,
            });
          }
        });

        setConnectedUsers(users);
        setUserCount(states.size);
      } catch (err) {
        console.error("Awareness error:", err);
      }
    });

    // Editor View Initialization:
    // Wait for IndexedDB initial read (or max 200ms) before mounting ProseMirror,
    // ensuring locally persisted offline state is in yXmlFragment first.
    let view = null;
    const createView = () => {
      if (!isMounted || viewRef.current || !editorRef.current) return;

      const aiSelectionPlugin = new Plugin({
        view() {
          return {
            update(v) {
              const { selection } = v.state;
              if (!selection.empty) {
                const { from, to } = selection;
                const text = v.state.doc.textBetween(from, to, " ");
                if (text.trim().length > 0) {
                  let coords = null;
                  try {
                    coords = v.coordsAtPos(to);
                  } catch {
                    // ignore
                  }
                  const startContext = Math.max(0, from - 200);
                  const endContext = Math.min(v.state.doc.content.size, to + 200);
                  const context = v.state.doc.textBetween(startContext, endContext, " ");

                  setSelectionInfo({
                    hasSelection: true,
                    text,
                    range: { from, to },
                    coords,
                    context,
                  });
                  return;
                }
              }

              if (!aiAssistantOpenRef.current) {
                setSelectionInfo((prev) => (prev.hasSelection ? { ...prev, hasSelection: false } : prev));
              }
            },
          };
        },
      });

      view = new EditorView(editorRef.current, {
        state: EditorState.create({
          schema: editorSchema,
          plugins: [
            ySyncPlugin(yXmlFragment),
            yCursorPlugin(provider.awareness, {
              cursorBuilder: buildCursor,
              selectionBuilder: buildSelection,
            }),
            yUndoPlugin(),
            aiSelectionPlugin,
            keymap({
              "Mod-z": yUndo,
              "Mod-y": yRedo,
              "Mod-Shift-z": yRedo,
              "Mod-b": () => {
                toggleMark(editorSchema.marks.strong)(viewRef.current.state, viewRef.current.dispatch);
                return true;
              },
              "Mod-i": () => {
                toggleMark(editorSchema.marks.em)(viewRef.current.state, viewRef.current.dispatch);
                return true;
              },
              "Mod-u": () => {
                toggleMark(editorSchema.marks.underline)(viewRef.current.state, viewRef.current.dispatch);
                return true;
              },
            }),
            keymap(baseKeymap),
          ],
        }),
        handleClick: (v) => {
          const { from } = v.state.selection;
          provider.awareness.setLocalStateField("cursor", { anchor: from });
          return false;
        },
        handleKeyDown: (v) => {
          setTimeout(() => {
            const { from } = v.state.selection;
            provider.awareness.setLocalStateField("cursor", { anchor: from });
          }, 0);
          return false;
        },
      });

      viewRef.current = view;
    };

    Promise.race([
      idbProvider.whenSynced,
      new Promise((resolve) => setTimeout(resolve, 200)),
    ]).then(() => {
      createView();
    });

    return () => {
      isMounted = false;
      if (syncMessageTimer) clearTimeout(syncMessageTimer);
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
      metadataMap.unobserve(handleMetadataChange);
      if (viewRef.current) {
        viewRef.current.destroy();
        viewRef.current = null;
      }
      provider.destroy();
      idbProvider.destroy();
      ydoc.destroy();
    };
  }, [currentDocId, currentUser]);

  // Editor toolbar actions
  const handleUndo = () => {
    if (viewRef.current) {
      yUndo(viewRef.current.state);
      viewRef.current.focus();
    }
  };

  const handleRedo = () => {
    if (viewRef.current) {
      yRedo(viewRef.current.state);
      viewRef.current.focus();
    }
  };

  const handleToggleBold = () => {
    if (viewRef.current) {
      toggleMark(editorSchema.marks.strong)(viewRef.current.state, viewRef.current.dispatch);
      viewRef.current.focus();
    }
  };

  const handleToggleItalic = () => {
    if (viewRef.current) {
      toggleMark(editorSchema.marks.em)(viewRef.current.state, viewRef.current.dispatch);
      viewRef.current.focus();
    }
  };

  const handleToggleUnderline = () => {
    if (viewRef.current) {
      toggleMark(editorSchema.marks.underline)(viewRef.current.state, viewRef.current.dispatch);
      viewRef.current.focus();
    }
  };

  const handleSetHeading = (level) => {
    if (!viewRef.current) return;
    const { state, dispatch } = viewRef.current;
    if (level === 0) {
      setBlockType(editorSchema.nodes.paragraph)(state, dispatch);
    } else {
      setBlockType(editorSchema.nodes.heading, { level })(state, dispatch);
    }
    viewRef.current.focus();
  };

  const handleExport = () => {
    if (viewRef.current) {
      const content = viewRef.current.state.doc.textContent;
      const blob = new Blob([content], { type: "text/plain" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${docTitle || "document"}.txt`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    }
  };

  // AI Writing Assistant Actions
  const handleApplyAiSuggestion = (replacementText, range) => {
    if (!viewRef.current || !range) return;
    const view = viewRef.current;
    const { state, dispatch } = view;
    const { from, to } = range;

    const docSize = state.doc.content.size;
    const safeFrom = Math.min(Math.max(0, from), docSize);
    const safeTo = Math.min(Math.max(safeFrom, to), docSize);

    // Apply text replacement via ProseMirror transaction
    // y-prosemirror intercepts this transaction and propagates CRDT update through Yjs
    const tr = state.tr.insertText(replacementText, safeFrom, safeTo);
    dispatch(tr);

    setAiAssistantOpen(false);
    setSelectionInfo((prev) => ({ ...prev, hasSelection: false }));
    view.focus();

    setToastMessage("AI suggestion applied to document!");
    setTimeout(() => setToastMessage(null), 3000);
  };

  const handleOpenAiAssistantFromToolbar = () => {
    if (viewRef.current) {
      const { selection } = viewRef.current.state;
      if (!selection.empty) {
        const text = viewRef.current.state.doc.textBetween(selection.from, selection.to, " ");
        if (text.trim().length > 0) {
          let coords = null;
          try {
            coords = viewRef.current.coordsAtPos(selection.to);
          } catch {
            // ignore
          }
          const startContext = Math.max(0, selection.from - 200);
          const endContext = Math.min(viewRef.current.state.doc.content.size, selection.to + 200);
          const context = viewRef.current.state.doc.textBetween(startContext, endContext, " ");

          setSelectionInfo({
            hasSelection: true,
            text,
            range: { from: selection.from, to: selection.to },
            coords,
            context,
          });
          setAiAssistantOpen(true);
          return;
        }
      }
    }

    setToastMessage("Select text in the editor first to use AI Writing Assistant");
    setTimeout(() => setToastMessage(null), 3000);
  };

  // Share functionality
  const getShareUrl = () => {
    const url = new URL(window.location.origin + window.location.pathname);
    url.searchParams.set("doc", currentDocId);
    return url.toString();
  };

  const copyToClipboard = async (text) => {
    if (navigator?.clipboard?.writeText) {
      try {
        await navigator.clipboard.writeText(text);
        return true;
      } catch (e) {
        console.warn("Clipboard API failed, using fallback:", e);
      }
    }

    try {
      const textarea = document.createElement("textarea");
      textarea.value = text;
      textarea.style.position = "fixed";
      textarea.style.opacity = "0";
      textarea.style.pointerEvents = "none";
      document.body.appendChild(textarea);
      textarea.focus();
      textarea.select();
      const ok = document.execCommand("copy");
      document.body.removeChild(textarea);
      return ok;
    } catch (e) {
      console.error("Fallback copy failed:", e);
      return false;
    }
  };

  const handleShare = async () => {
    const url = getShareUrl();
    setShareModalOpen(true);
    const ok = await copyToClipboard(url);
    if (ok) {
      setCopied(true);
      setToastMessage("Link copied to clipboard! Share it with others to collaborate.");
      setTimeout(() => setCopied(false), 2500);
      setTimeout(() => setToastMessage(null), 3500);
    }
  };

  const handleNewDocument = () => {
    const newDocId = `doc-${Math.random().toString(36).substring(2, 9)}`;
    window.location.href = `/?doc=${newDocId}`;
  };

  // Version History Handlers
  const handleCreateCheckpoint = async (description) => {
    try {
      const res = await fetch(`http://localhost:1234/api/documents/${currentDocId}/versions`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          description,
          user: currentUser,
        }),
      });
      if (res.ok) {
        setToastMessage("Checkpoint created successfully!");
        setTimeout(() => setToastMessage(null), 3000);
        fetchVersions();
      } else {
        const data = await res.json().catch(() => ({}));
        alert(data.error || `Server responded with status ${res.status}`);
      }
    } catch (err) {
      console.error("Create checkpoint error:", err);
      alert("Failed to connect to backend server at http://localhost:1234. Make sure backend is running.");
    }
  };

  const handleViewVersion = async (versionSummary) => {
    try {
      const res = await fetch(`http://localhost:1234/api/documents/${currentDocId}/versions/${versionSummary.id}`);
      if (res.ok) {
        const fullVersion = await res.json();
        setActivePreviewVersion(fullVersion);
        setHistoryDrawerOpen(false);
      }
    } catch (e) {
      console.error("View version error:", e);
    }
  };

  const handleExitPreview = () => {
    setActivePreviewVersion(null);
  };

  const handleRestoreVersion = async (version) => {
    const confirmed = window.confirm(
      `Restore Version ${version.versionNumber}?\n\nThis will apply Version ${version.versionNumber} to the live document for all collaborators, and record a new Version in history.`
    );
    if (!confirmed) return;

    setRestoring(true);
    try {
      const res = await fetch(
        `http://localhost:1234/api/documents/${currentDocId}/versions/${version.id}/restore`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ user: currentUser }),
        }
      );
      if (res.ok) {
        setActivePreviewVersion(null);
        setToastMessage(`Restored from Version ${version.versionNumber}!`);
        setTimeout(() => setToastMessage(null), 4000);
        fetchVersions();
      } else {
        alert("Failed to restore version.");
      }
    } catch (e) {
      console.error("Restore error:", e);
    } finally {
      setRestoring(false);
    }
  };

  const handleCompareVersions = (idA, idB) => {
    setDiffVersionA(idA);
    setDiffVersionB(idB);
    setDiffModalOpen(true);
  };

  // If user has not entered their name yet, show simple welcome card
  if (!currentUser) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-100 via-blue-50/50 to-indigo-100/50 flex items-center justify-center p-4">
        <div className="max-w-md w-full bg-white rounded-2xl shadow-xl border border-slate-200/80 p-8">
          <div className="flex items-center space-x-3 mb-6">
            <div className="w-12 h-12 rounded-xl bg-blue-600 text-white flex items-center justify-center shadow-md shadow-blue-500/20">
              <FileText className="w-6 h-6" />
            </div>
            <div>
              <h1 className="text-xl font-bold text-slate-900 flex items-center gap-1.5">
                Dastavez <Sparkles className="w-4 h-4 text-amber-500" />
              </h1>
              <p className="text-xs text-slate-500">Real-Time Collaborative Document Editor</p>
            </div>
          </div>

          <form onSubmit={handleStartEditing} className="space-y-5">
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-2">
                Apna Naam Enter Kijiye:
              </label>
              <input
                type="text"
                value={loginNameInput}
                onChange={(e) => setLoginNameInput(e.target.value)}
                placeholder="e.g. Aman Sharma (ya blank chhodein)"
                className="w-full px-4 py-2.5 text-sm bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:border-blue-500 focus:bg-white transition-colors"
                autoFocus
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-2">
                Apna Cursor Color Chuniye:
              </label>
              <div className="flex items-center gap-2">
                {COLOR_PALETTE.map((color) => (
                  <button
                    key={color}
                    type="button"
                    onClick={() => setSelectedColor(color)}
                    className={`w-7 h-7 rounded-full transition-transform ${
                      selectedColor === color ? "scale-125 ring-2 ring-offset-2 ring-slate-800" : "hover:scale-110"
                    }`}
                    style={{ backgroundColor: color }}
                  />
                ))}
              </div>
            </div>

            <button
              type="submit"
              className="w-full bg-blue-600 hover:bg-blue-700 active:bg-blue-800 text-white font-semibold py-2.5 px-4 rounded-xl text-sm transition-colors shadow-md shadow-blue-600/20 flex items-center justify-center gap-2"
            >
              <span>Start Collaborating</span>
            </button>
          </form>

          <p className="text-center text-[11px] text-slate-400 mt-6">
            CRDT (Yjs) + ProseMirror + WebSockets se powered
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className={`min-h-screen transition-colors duration-200 ${theme === "dark" ? "dark bg-slate-950 text-slate-100" : "bg-slate-100/70 text-slate-900"}`}>
      {/* Top Header / App Bar */}
      <header className="bg-white/90 dark:bg-slate-900/90 backdrop-blur-md border-b border-slate-200 dark:border-slate-800 sticky top-0 z-20 shadow-xs transition-colors">
        {/* Row 1: Brand Logo, Doc Title, Live Status & User Profile */}
        <div className="max-w-7xl mx-auto px-4 py-2 flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 dark:border-slate-800/60">
          <div className="flex items-center space-x-3">
            <div className="flex items-center space-x-2">
              <div className="w-8 h-8 rounded-xl bg-gradient-to-tr from-indigo-600 via-indigo-500 to-purple-500 flex items-center justify-center text-white shadow-md shadow-indigo-500/20">
                <FileText className="w-4 h-4" />
              </div>
              <input
                type="text"
                value={docTitle}
                onChange={(e) => {
                  const newTitle = e.target.value;
                  setDocTitle(newTitle);
                  metadataMapRef.current?.set("title", newTitle);
                }}
                className="text-sm sm:text-base font-bold bg-transparent border border-transparent hover:border-slate-300 dark:hover:border-slate-700 focus:border-indigo-500 focus:bg-white dark:focus:bg-slate-800 px-2 py-1 rounded-lg transition duration-150 outline-none text-slate-900 dark:text-slate-100 max-w-[200px] sm:max-w-[300px] truncate"
                placeholder="Untitled Document"
              />
            </div>

            <div className="flex items-center space-x-2 pl-2 border-l border-slate-200 dark:border-slate-800">
              <div
                className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-semibold transition-all select-none ${
                  connectionStatus === "online"
                    ? "bg-emerald-50 dark:bg-emerald-950/50 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800/60"
                    : connectionStatus === "syncing"
                    ? "bg-amber-50 dark:bg-amber-950/50 text-amber-700 dark:text-amber-300 border border-amber-200 dark:border-amber-800/60"
                    : "bg-rose-50 dark:bg-rose-950/50 text-rose-700 dark:text-rose-300 border border-rose-200 dark:border-rose-800/60"
                }`}
              >
                {connectionStatus === "online" ? (
                  <span className="relative flex h-2 w-2">
                    <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
                  </span>
                ) : connectionStatus === "syncing" ? (
                  <span className="relative flex h-2 w-2">
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-amber-400 opacity-75"></span>
                    <span className="relative inline-flex rounded-full h-2 w-2 bg-amber-500"></span>
                  </span>
                ) : (
                  <span className="relative flex h-2 w-2">
                    <span className="relative inline-flex rounded-full h-2 w-2 bg-rose-500"></span>
                  </span>
                )}

                <span>
                  {connectionStatus === "online"
                    ? (syncMessage || "Online")
                    : connectionStatus === "syncing"
                    ? (syncMessage || "Syncing...")
                    : "Offline"}
                </span>
              </div>
            </div>
          </div>

          <div className="flex items-center space-x-2">
            {/* Active Collaborators count & avatars */}
            <div className="flex items-center space-x-1.5 pr-2">
              <Users className="w-3.5 h-3.5 text-slate-400" />
              <span className="text-xs font-semibold text-slate-600 dark:text-slate-400">{userCount}</span>
              <div className="flex -space-x-1.5 ml-1">
                {Array.from(connectedUsers.values())
                  .slice(0, 3)
                  .map((u, i) => (
                    <div
                      key={i}
                      className="w-6 h-6 rounded-full border-2 border-white dark:border-slate-900 flex items-center justify-center text-white text-[10px] font-bold shadow-xs"
                      style={{ backgroundColor: u.color }}
                      title={u.name}
                    >
                      {u.name.charAt(0).toUpperCase()}
                    </div>
                  ))}
                {connectedUsers.size > 3 && (
                  <div className="w-6 h-6 bg-slate-400 rounded-full border-2 border-white dark:border-slate-900 flex items-center justify-center text-white text-[10px] font-bold">
                    +{connectedUsers.size - 3}
                  </div>
                )}
              </div>
            </div>

            {/* Working Theme Switcher Button */}
            <button
              type="button"
              onClick={() => {
                const nextTheme = theme === "dark" ? "light" : "dark";
                setTheme(nextTheme);
              }}
              className="flex items-center gap-1.5 px-3 py-1 rounded-full border text-xs font-semibold transition-all cursor-pointer shadow-xs bg-slate-100 dark:bg-slate-800 border-slate-200 dark:border-slate-700/80 text-slate-700 dark:text-slate-200 hover:bg-slate-200 dark:hover:bg-slate-700"
              title={`Switch to ${theme === "dark" ? "Light" : "Dark"} Mode`}
            >
              {theme === "dark" ? (
                <>
                  <Sun className="w-3.5 h-3.5 text-amber-400" />
                  <span>Light Mode</span>
                </>
              ) : (
                <>
                  <Moon className="w-3.5 h-3.5 text-indigo-500" />
                  <span>Dark Mode</span>
                </>
              )}
            </button>

            {/* User Profile Badge & Logout */}
            <div className="flex items-center space-x-1.5 pl-2 border-l border-slate-200 dark:border-slate-800">
              <div
                className="w-7 h-7 rounded-full flex items-center justify-center text-white text-xs font-bold shadow-xs"
                style={{ backgroundColor: currentUser.color }}
                title={`You: ${currentUser.name}`}
              >
                {currentUser.name.charAt(0).toUpperCase()}
              </div>
              <span className="text-xs font-semibold text-slate-700 dark:text-slate-300 max-w-[80px] truncate hidden sm:inline">
                {currentUser.name}
              </span>
              <button
                onClick={handleSignOut}
                className="p-1 text-slate-400 hover:text-rose-500 rounded-md transition-colors"
                title="Sign Out"
              >
                <LogOut className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
        </div>

        {/* Row 2: Formatting Tools & Action Buttons */}
        <div className="max-w-7xl mx-auto px-4 py-1.5 flex flex-wrap items-center justify-between gap-2">
          {/* Formatting Toolbar */}
          <div className="flex items-center space-x-1 bg-slate-100/80 dark:bg-slate-800/80 p-1 rounded-xl border border-slate-200/80 dark:border-slate-700/80">
            <button
              onClick={handleUndo}
              className="p-1.5 hover:bg-white dark:hover:bg-slate-700 text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white rounded-lg transition-colors shadow-2xs cursor-pointer"
              title="Undo (Ctrl+Z)"
            >
              <Undo2 className="w-4 h-4" />
            </button>
            <button
              onClick={handleRedo}
              className="p-1.5 hover:bg-white dark:hover:bg-slate-700 text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white rounded-lg transition-colors shadow-2xs cursor-pointer"
              title="Redo (Ctrl+Y)"
            >
              <Redo2 className="w-4 h-4" />
            </button>

            <div className="w-px h-4 bg-slate-300 dark:bg-slate-700 mx-1" />

            <button
              onClick={handleToggleBold}
              className="p-1.5 hover:bg-white dark:hover:bg-slate-700 text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white rounded-lg transition-colors shadow-2xs cursor-pointer"
              title="Bold (Ctrl+B)"
            >
              <Bold className="w-4 h-4" />
            </button>
            <button
              onClick={handleToggleItalic}
              className="p-1.5 hover:bg-white dark:hover:bg-slate-700 text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white rounded-lg transition-colors shadow-2xs cursor-pointer"
              title="Italic (Ctrl+I)"
            >
              <Italic className="w-4 h-4" />
            </button>
            <button
              onClick={handleToggleUnderline}
              className="p-1.5 hover:bg-white dark:hover:bg-slate-700 text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white rounded-lg transition-colors shadow-2xs cursor-pointer"
              title="Underline (Ctrl+U)"
            >
              <Underline className="w-4 h-4" />
            </button>

            <div className="w-px h-4 bg-slate-300 dark:bg-slate-700 mx-1" />

            <select
              onChange={(e) => handleSetHeading(Number(e.target.value))}
              className="text-xs bg-transparent text-slate-700 dark:text-slate-200 py-1 px-1.5 rounded-lg focus:outline-none hover:bg-white dark:hover:bg-slate-700 cursor-pointer font-medium"
              defaultValue="0"
              title="Heading Style"
            >
              <option value="0" className="dark:bg-slate-900">Normal</option>
              <option value="1" className="dark:bg-slate-900">Heading 1</option>
              <option value="2" className="dark:bg-slate-900">Heading 2</option>
              <option value="3" className="dark:bg-slate-900">Heading 3</option>
            </select>

            <div className="w-px h-4 bg-slate-300 dark:bg-slate-700 mx-1" />

            <select
              value={zoomLevel}
              onChange={(e) => setZoomLevel(Number(e.target.value))}
              className="text-xs bg-transparent text-slate-700 dark:text-slate-200 py-1 px-1.5 rounded-lg focus:outline-none hover:bg-white dark:hover:bg-slate-700 cursor-pointer font-medium"
              title="Zoom Level"
            >
              {[50, 75, 100, 125, 150].map((z) => (
                <option key={z} value={z} className="dark:bg-slate-900">{z}%</option>
              ))}
            </select>

            <button
              onClick={handleExport}
              className="p-1.5 hover:bg-white dark:hover:bg-slate-700 text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white rounded-lg transition-colors shadow-2xs cursor-pointer"
              title="Export as Text (.txt)"
            >
              <Download className="w-4 h-4" />
            </button>
          </div>

          {/* Action Pills */}
          <div className="flex items-center space-x-2">
            <button
              type="button"
              onMouseDown={(e) => {
                e.preventDefault();
                handleOpenAiAssistantFromToolbar();
              }}
              className={`px-3 py-1.5 rounded-xl transition-all shadow-xs flex items-center gap-1.5 text-xs font-semibold cursor-pointer ${
                selectionInfo.hasSelection
                  ? "bg-indigo-600 text-white hover:bg-indigo-500 shadow-indigo-500/25 animate-pulse"
                  : "bg-indigo-50 dark:bg-indigo-950/60 text-indigo-700 dark:text-indigo-300 hover:bg-indigo-100 dark:hover:bg-indigo-900/60 border border-indigo-200/80 dark:border-indigo-800/60"
              }`}
              title={selectionInfo.hasSelection ? "AI Writing Assistant" : "Select text to use AI Writing Assistant"}
            >
              <Sparkles className="w-3.5 h-3.5 text-amber-500 shrink-0" />
              <span>AI Assist</span>
            </button>

            <button
              onClick={() => setChatPanelOpen((prev) => !prev)}
              className={`flex items-center space-x-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold transition-all cursor-pointer shadow-xs ${
                chatPanelOpen
                  ? "bg-indigo-600 text-white shadow-indigo-600/25"
                  : "bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-200 hover:bg-slate-200 dark:hover:bg-slate-700 border border-slate-200 dark:border-slate-700/80"
              }`}
              title="Chat with Document (AI RAG Assistant)"
            >
              <MessageSquare className="w-3.5 h-3.5 text-indigo-500 shrink-0" />
              <span>Ask Document</span>
            </button>

            <button
              onClick={() => {
                setHistoryDrawerOpen(true);
                fetchVersions();
              }}
              className="flex items-center space-x-1.5 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 border border-slate-200 dark:border-slate-700/80 px-3 py-1.5 rounded-xl text-xs font-semibold transition-colors cursor-pointer shadow-xs"
              title="View document version history"
            >
              <History className="w-3.5 h-3.5 text-blue-500" />
              <span>History</span>
              {versionsList.length > 0 && (
                <span className="bg-blue-600 text-white text-[10px] px-1.5 py-0.2 rounded-full font-bold ml-0.5">
                  {versionsList.length}
                </span>
              )}
            </button>

            <button
              onClick={handleNewDocument}
              className="flex items-center space-x-1 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 border border-slate-200 dark:border-slate-700/80 px-2.5 py-1.5 rounded-xl text-xs font-semibold transition-colors cursor-pointer shadow-xs"
              title="Create a new document room"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>New Doc</span>
            </button>

            <button
              onClick={handleShare}
              className={`flex items-center space-x-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold transition-all shadow-xs cursor-pointer ${
                copied
                  ? "bg-emerald-600 text-white"
                  : "bg-indigo-600 hover:bg-indigo-500 text-white shadow-indigo-600/20"
              }`}
              title="Share this document"
            >
              {copied ? <Check className="w-3.5 h-3.5" /> : <Share2 className="w-3.5 h-3.5" />}
              <span>{copied ? "Copied!" : "Share"}</span>
            </button>
          </div>
        </div>
      </header>

      {/* Non-intrusive Offline Notice Banner */}
      {connectionStatus === "offline" && (
        <div className="bg-gradient-to-r from-rose-50 via-amber-50/60 to-rose-50 border-b border-rose-200/80 px-4 py-2 transition-all">
          <div className="max-w-4xl mx-auto flex flex-wrap items-center justify-between gap-2 text-xs">
            <div className="flex items-center space-x-2 text-rose-900">
              <span className="flex h-2 w-2 rounded-full bg-rose-500 shrink-0"></span>
              <span className="font-semibold">Working offline</span>
              <span className="text-rose-700 hidden sm:inline">— changes are saved locally to IndexedDB and will sync automatically when you reconnect.</span>
            </div>
            <div className="flex items-center space-x-2">
              <span className="inline-flex items-center gap-1 text-[11px] bg-white border border-rose-200/80 px-2 py-0.5 rounded-md font-medium text-rose-700 shadow-2xs">
                <HardDrive className="w-3 h-3 text-rose-500" />
                <span>Saved locally</span>
              </span>
              <button
                type="button"
                onClick={() => {
                  if (providerRef.current) {
                    setConnectionStatus("syncing");
                    setSyncMessage("Reconnecting...");
                    providerRef.current.connect();
                  }
                }}
                className="text-[11px] font-semibold text-rose-800 hover:text-rose-950 bg-white hover:bg-rose-100 border border-rose-300 px-2.5 py-0.5 rounded-md transition-colors flex items-center gap-1 shadow-2xs cursor-pointer"
              >
                <RefreshCw className="w-2.5 h-2.5" />
                <span>Retry now</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Historical Version Preview Banner */}
      {activePreviewVersion && (
        <VersionPreviewBanner
          version={activePreviewVersion}
          onRestore={handleRestoreVersion}
          onExitPreview={handleExitPreview}
          restoring={restoring}
        />
      )}

      {/* Main Container with Document Canvas and Chat Panel */}
      <div className="flex-1 flex overflow-hidden relative">
        {/* Main Document Canvas */}
        <main className={`flex-1 transition-all duration-300 overflow-y-auto py-8 px-4 ${chatPanelOpen ? "max-w-4xl" : "max-w-4xl mx-auto"}`}>
          <div className="bg-white dark:bg-slate-900 shadow-lg dark:shadow-2xl rounded-xl min-h-[750px] border border-slate-200/80 dark:border-slate-800 overflow-hidden transition-colors">
            {/* Historical Version Read-Only View */}
            {activePreviewVersion ? (
              <div
                className="prosemirror-editor bg-amber-50/15 dark:bg-amber-950/10 text-slate-800 dark:text-slate-200"
                style={{
                  minHeight: "750px",
                  padding: "64px 72px",
                  lineHeight: "1.6",
                  fontSize: "15px",
                  whiteSpace: "pre-wrap",
                  fontFamily: "Inter, system-ui, -apple-system, sans-serif",
                }}
              >
                {activePreviewVersion.contentText || "(Empty document in this version)"}
              </div>
            ) : (
              <div
                ref={editorRef}
                className="prosemirror-editor focus:outline-none text-slate-900 dark:text-slate-100"
                style={{
                  minHeight: "750px",
                  padding: "64px 72px",
                  lineHeight: "1.6",
                  fontSize: "15px",
                  outline: "none",
                  transform: `scale(${zoomLevel / 100})`,
                  transformOrigin: "top center",
                  transition: "transform 0.15s ease",
                }}
              />
            )}
          </div>
        </main>

        {/* Chat With Document AI Panel */}
        <ChatPanel
          documentId={currentDocId}
          isOpen={chatPanelOpen}
          onClose={() => setChatPanelOpen(false)}
          editorView={viewRef.current}
        />
      </div>

      {/* Share Modal Dialog */}
      {shareModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-xs p-4">
          <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 w-full max-w-md p-6 relative animate-in fade-in zoom-in-95 duration-150">
            <button
              onClick={() => setShareModalOpen(false)}
              className="absolute top-4 right-4 p-1.5 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-lg transition-colors"
            >
              <X className="w-4 h-4" />
            </button>

            <div className="flex items-center space-x-3 mb-3">
              <div className="w-10 h-10 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center">
                <Share2 className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-base font-semibold text-slate-900">Share Document</h3>
                <p className="text-xs text-slate-500">Invite collaborators to edit this document in real time.</p>
              </div>
            </div>

            <div className="mt-4">
              <label className="block text-xs font-medium text-slate-700 mb-1.5">Collaboration Link</label>
              <div className="flex items-center space-x-2">
                <input
                  type="text"
                  readOnly
                  value={getShareUrl()}
                  onClick={(e) => e.target.select()}
                  className="flex-1 bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-xs text-slate-700 focus:outline-none focus:border-blue-500 font-mono select-all"
                />
                <button
                  onClick={async () => {
                    const ok = await copyToClipboard(getShareUrl());
                    if (ok) {
                      setCopied(true);
                      setToastMessage("Copied to clipboard!");
                      setTimeout(() => setCopied(false), 2500);
                      setTimeout(() => setToastMessage(null), 3500);
                    }
                  }}
                  className={`flex items-center space-x-1.5 px-3 py-2 rounded-lg text-xs font-medium transition-colors ${
                    copied
                      ? "bg-emerald-600 text-white"
                      : "bg-blue-600 text-white hover:bg-blue-700"
                  }`}
                >
                  {copied ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                  <span>{copied ? "Copied" : "Copy"}</span>
                </button>
              </div>
            </div>

            <div className="mt-4 pt-4 border-t border-slate-100 flex items-center justify-between">
              <span className="text-[11px] text-slate-500">
                Room: <span className="font-mono font-medium text-slate-700">{currentDocId}</span>
              </span>
              <a
                href={getShareUrl()}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center space-x-1 text-xs text-blue-600 hover:text-blue-700 font-medium hover:underline"
              >
                <span>Open in new tab</span>
                <ExternalLink className="w-3 h-3" />
              </a>
            </div>
          </div>
        </div>
      )}

      {/* Floating Toast Notification */}
      {toastMessage && (
        <div className="fixed bottom-6 left-1/2 transform -translate-x-1/2 z-50 bg-slate-900/90 text-white px-4 py-2.5 rounded-xl shadow-xl flex items-center space-x-2 text-xs font-medium backdrop-blur-xs border border-slate-800">
          <Check className="w-4 h-4 text-emerald-400" />
          <span>{toastMessage}</span>
        </div>
      )}
      {/* Version History Drawer */}
      <VersionHistoryDrawer
        isOpen={historyDrawerOpen}
        onClose={() => setHistoryDrawerOpen(false)}
        versions={versionsList}
        loading={loadingVersions}
        onViewVersion={handleViewVersion}
        onCompareVersions={handleCompareVersions}
        onRestoreVersion={handleRestoreVersion}
        onCreateCheckpoint={handleCreateCheckpoint}
        activePreviewVersion={activePreviewVersion}
      />

      {/* Version Diff Modal */}
      <VersionDiffModal
        isOpen={diffModalOpen}
        onClose={() => setDiffModalOpen(false)}
        documentId={currentDocId}
        versions={versionsList}
        initialVersionA={diffVersionA}
        initialVersionB={diffVersionB}
      />

      {/* Floating AI Action Trigger near selection */}
      {selectionInfo.hasSelection && !aiAssistantOpen && (
        <button
          type="button"
          onMouseDown={(e) => {
            e.preventDefault();
            setAiAssistantOpen(true);
          }}
          style={{
            position: "fixed",
            top: `${Math.max(68, (selectionInfo.coords?.top || 100) - 36)}px`,
            left: `${Math.min(window.innerWidth - 130, Math.max(16, (selectionInfo.coords?.left || 100)))}px`,
            zIndex: 45,
          }}
          className="bg-slate-900 hover:bg-indigo-600 text-white rounded-full px-3 py-1.5 text-xs font-semibold shadow-xl hover:shadow-indigo-500/25 flex items-center gap-1.5 transition-all transform hover:scale-105 active:scale-95 animate-in fade-in zoom-in-90 duration-150 cursor-pointer border border-slate-700/80"
          title="Open AI Writing Assistant"
        >
          <Sparkles className="w-3.5 h-3.5 text-amber-400" />
          <span>AI Assist</span>
        </button>
      )}

      {/* AI Writing Assistant Popover / Dialog */}
      <AiWritingAssistant
        isOpen={aiAssistantOpen}
        onClose={() => setAiAssistantOpen(false)}
        selectedText={selectionInfo.text}
        selectionRange={selectionInfo.range}
        context={selectionInfo.context}
        documentId={currentDocId}
        position={selectionInfo.coords}
        onAccept={handleApplyAiSuggestion}
      />
    </div>
  );
}
