import { ethers } from
  "https://cdnjs.cloudflare.com/ajax/libs/ethers/6.7.0/ethers.min.js";

const ADDRESS = "0x266698a18e1C9Ec9476009D8f7E5DB96d9e7F685"; // Set your deployed contract address here
const $ = (id) => document.getElementById(id);
const statuses = ["Available", "Borrowed", "Return requested"];
const activityEvents = [
  "EquipmentAdded",
  "EquipmentBorrowed",
  "ReturnRequested",
  "ReturnConfirmed"
];

let contract;
let provider;
let account;
let adminAddress;

function setMessage(message, target = "items") {
  const text = $(target === "add" ? "addMessageText" : "itemsMessageText");
  text.textContent = message;
}

function getErrorMessage(error) {
  const raw = error.reason || error.shortMessage || error.message || "Something went wrong.";
  const normalized = raw.toLowerCase();

  if (normalized.includes("not awaiting return request")) {
    return "This item is not currently borrowed, so it cannot be marked for return.";
  }
  if (normalized.includes("borrower only")) {
    return "Only the wallet that borrowed this item can request its return.";
  }
  if (normalized.includes("admin only")) {
    return "Only the contract administrator can perform this action.";
  }
  if (normalized.includes("equipment unavailable")) {
    return "This item is already borrowed or has a return request in progress.";
  }
  if (normalized.includes("invalid equipment id")) {
    return "That equipment item could not be found.";
  }
  if (normalized.includes("return not requested")) {
    return "The borrower must request the return before an admin can confirm it.";
  }

  return raw;
}

async function run(action, target = "items") {
  document.querySelectorAll("button").forEach(button => button.disabled = true);
  setMessage("Working...", target);

  try {
    await action();
  } catch (error) {
    setMessage(getErrorMessage(error), target);
  } finally {
    document.querySelectorAll("button").forEach(button => button.disabled = false);
  }
}

function requireConnection() {
  if (!contract) throw new Error("Connect MetaMask first.");
}

function shortAddress(address) {
  if (!address || address === ethers.ZeroAddress) return "—";
  return `${address.slice(0, 6)}…${address.slice(-4)}`;
}

function addCell(row, value, className = "") {
  const cell = document.createElement("td");
  cell.textContent = value;
  if (className) cell.className = className;
  row.appendChild(cell);
  return cell;
}

function actionButton(label, action, id, style = "") {
  const button = document.createElement("button");
  button.type = "button";
  button.className = `button row-action ${style}`.trim();
  button.textContent = label;
  button.dataset.action = action;
  button.dataset.id = id;
  return button;
}

function renderActionCell(row, id, borrower, state) {
  const cell = document.createElement("td");
  cell.className = "action-cell";
  const isBorrower = borrower.toLowerCase() === account.toLowerCase();
  const isAdmin = account.toLowerCase() === adminAddress.toLowerCase();

  if (Number(state) === 0) {
    cell.appendChild(actionButton("Borrow", "borrow", id, "row-action-primary"));
  } else if (Number(state) === 1 && isBorrower) {
    cell.appendChild(actionButton("Request return", "request", id, "row-action-secondary"));
  } else if (Number(state) === 2 && isAdmin) {
    cell.appendChild(actionButton("Confirm return", "confirm", id, "row-action-primary"));
  } else {
    const hint = document.createElement("span");
    hint.className = "action-hint";
    hint.textContent = Number(state) === 1
      ? "Waiting for borrower"
      : "Waiting for admin";
    cell.appendChild(hint);
  }

  row.appendChild(cell);
}

function nextStep(state, borrower) {
  const isBorrower = borrower.toLowerCase() === account.toLowerCase();
  const isAdmin = account.toLowerCase() === adminAddress.toLowerCase();

  if (Number(state) === 0) return "Ready to borrow";
  if (Number(state) === 1) {
    return isBorrower ? "Return it, then request return" : "Waiting for borrower";
  }
  return isAdmin ? "Review physical handoff" : "Waiting for admin confirmation";
}

async function refreshItems() {
  requireConnection();
  const count = await contract.count();
  const body = $("items");
  body.replaceChildren();

  for (let id = 1n; id <= count; id++) {
    const [name, borrower, state] = await contract.getItem(id);
    const row = document.createElement("tr");
    const stateNumber = Number(state);
    const borrowerAddress = borrower === ethers.ZeroAddress ? "" : borrower;

    addCell(row, id.toString(), "item-id");
    addCell(row, name, "item-name");

    const statusCell = document.createElement("td");
    statusCell.className = "status-cell";
    const badge = document.createElement("span");
    badge.className = `state-badge state-${["available", "borrowed", "requested"][stateNumber] || "unknown"}`;
    badge.textContent = statuses[stateNumber] || "Unknown";
    const hint = document.createElement("small");
    hint.textContent = nextStep(state, borrowerAddress || ethers.ZeroAddress);
    statusCell.append(badge, hint);
    row.appendChild(statusCell);

    const borrowerCell = addCell(row, shortAddress(borrowerAddress), "borrower-cell");
    if (borrowerAddress) borrowerCell.title = borrowerAddress;
    renderActionCell(row, id.toString(), borrowerAddress || ethers.ZeroAddress, state);
    body.appendChild(row);
  }
}

function describeEvent(log) {
  const id = log.args.id.toString();
  const name = log.fragment.name;
  const who = log.args.borrower ? shortAddress(log.args.borrower) : "";

  switch (name) {
    case "EquipmentAdded":
      return { title: `Item #${id} added to the pool`, detail: log.args.name };
    case "EquipmentBorrowed":
      return { title: `Item #${id} borrowed`, detail: who };
    case "ReturnRequested":
      return { title: `Return requested for item #${id}`, detail: who };
    case "ReturnConfirmed":
      return { title: `Return confirmed for item #${id}`, detail: who };
    default:
      return { title: `Activity for item #${id}`, detail: "" };
  }
}

async function refreshActivity() {
  const list = $("activity");

  try {
    const latestBlock = await provider.getBlockNumber();
    const fromBlock = Math.max(0, latestBlock - 10000);
    const logsByEvent = await Promise.all(activityEvents.map(eventName =>
      contract.queryFilter(contract.filters[eventName](), fromBlock, latestBlock)
    ));
    const logs = logsByEvent.flat().sort((a, b) => b.blockNumber - a.blockNumber).slice(0, 8);
    list.replaceChildren();

    if (!logs.length) {
      const empty = document.createElement("p");
      empty.className = "activity-empty";
      empty.textContent = "No lending activity found in the latest 10,000 blocks.";
      list.appendChild(empty);
      return;
    }

    const blocks = new Map();
    await Promise.all(logs.map(async log => {
      if (!blocks.has(log.blockNumber)) {
        blocks.set(log.blockNumber, provider.getBlock(log.blockNumber));
      }
      await blocks.get(log.blockNumber);
    }));

    for (const log of logs) {
      const item = describeEvent(log);
      const entry = document.createElement("article");
      entry.className = "activity-entry";
      const mark = document.createElement("span");
      mark.className = "activity-mark";
      mark.textContent = log.fragment.name === "ReturnConfirmed" ? "✓" : "↗";
      const copy = document.createElement("div");
      copy.className = "activity-copy";
      const title = document.createElement("strong");
      title.textContent = item.title;
      const detail = document.createElement("span");
      detail.textContent = item.detail;
      copy.append(title, detail);
      const time = document.createElement("time");
      const block = await blocks.get(log.blockNumber);
      if (block) {
        const date = new Date(Number(block.timestamp) * 1000);
        time.dateTime = date.toISOString();
        time.textContent = new Intl.DateTimeFormat(undefined, {
          dateStyle: "medium", timeStyle: "short"
        }).format(date);
      } else {
        time.textContent = `Block ${log.blockNumber}`;
      }
      entry.append(mark, copy, time);
      list.appendChild(entry);
    }
  } catch (error) {
    list.replaceChildren();
    const unavailable = document.createElement("p");
    unavailable.className = "activity-empty activity-error";
    unavailable.textContent = "Recent activity could not be loaded. Try refreshing the list.";
    list.appendChild(unavailable);
  }
}

async function connect() {
  contract = null;

  if (!window.ethereum) throw new Error("Install MetaMask first.");
  if (!ethers.isAddress(ADDRESS)) {
    throw new Error("Set your deployed contract address in app.js.");
  }

  await window.ethereum.request({ method: "eth_requestAccounts" });

  provider = new ethers.BrowserProvider(window.ethereum);
  const network = await provider.getNetwork();

  if (network.chainId !== 11155111n) {
    throw new Error("Switch this site's MetaMask connection to Sepolia.");
  }

  if (await provider.getCode(ADDRESS) === "0x") {
    throw new Error("No contract found at this address on Sepolia.");
  }

  const response = await fetch("./abi.json");
  if (!response.ok) throw new Error("Could not load abi.json.");

  const abi = await response.json();
  const signer = await provider.getSigner();
  contract = new ethers.Contract(ADDRESS, abi, signer);
  account = await signer.getAddress();
  adminAddress = await contract.admin();
  const role = account.toLowerCase() === adminAddress.toLowerCase()
    ? "Administrator" : "Student";

  $("wallet").textContent = `${account} | ${role} | Sepolia`;
  await refreshItems();
  await refreshActivity();
  setMessage("Wallet connected to Sepolia.");
}

async function write(method, id) {
  requireConnection();
  const tx = await contract[method](id, { gasLimit: 800000n });
  setMessage(`Waiting for confirmation:\n${tx.hash}`, "items");

  try {
    await tx.wait();
  } catch (error) {
    throw new Error(
      `Transaction failed: ${tx.hash}\n` +
      (error.reason || error.shortMessage || error.message)
    );
  }

  await refreshItems();
  await refreshActivity();
  setMessage(`Transaction confirmed:\n${tx.hash}`, "items");
}

$("connect").onclick = () => run(connect);

$("refresh").onclick = () => run(async () => {
  await refreshItems();
  await refreshActivity();
  setMessage("Equipment and recent activity refreshed.", "items");
}, "items");

$("add").onclick = () => run(async () => {
  requireConnection();
  const name = $("name").value.trim();
  if (!name) throw new Error("Enter an equipment name.");
  const tx = await contract.addEquipment(name, { gasLimit: 800000n });
  setMessage(`Waiting for confirmation:\n${tx.hash}`, "add");
  try {
    await tx.wait();
  } catch (error) {
    throw new Error(
      `Transaction failed: ${tx.hash}\n` +
      (error.reason || error.shortMessage || error.message)
    );
  }
  await refreshItems();
  await refreshActivity();
  $("name").value = "";
  setMessage(`Equipment registered:\n${tx.hash}`, "add");
}, "add");

$("items").addEventListener("click", event => {
  const button = event.target.closest("button[data-action]");
  if (!button) return;
  const method = {
    borrow: "borrowEquipment",
    request: "requestReturn",
    confirm: "confirmReturn"
  }[button.dataset.action];
  if (method) run(() => write(method, BigInt(button.dataset.id)), "items");
});

window.ethereum?.on("accountsChanged", () => location.reload());
window.ethereum?.on("chainChanged", () => location.reload());
