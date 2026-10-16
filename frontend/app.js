import { ethers } from
  "https://cdnjs.cloudflare.com/ajax/libs/ethers/6.7.0/ethers.min.js";

const ADDRESS = "0x266698a18e1C9Ec9476009D8f7E5DB96d9e7F685"; // Set your deployed contract address here
const $ = (id) => document.getElementById(id);
const statuses = ["Available", "Borrowed", "Return requested"];

let contract;

async function run(action) {
  document.querySelectorAll("button").forEach(b => b.disabled = true);
  $("message").textContent = "Working...";

  try {
    await action();
  } catch (error) {
    $("message").textContent =
      error.reason || error.shortMessage || error.message;
  } finally {
    document.querySelectorAll("button").forEach(b => b.disabled = false);
  }
}

function requireConnection() {
  if (!contract) throw new Error("Connect MetaMask first.");
}

function selectedId() {
  const value = $("itemId").value.trim();
  if (!/^[1-9]\d*$/.test(value)) {
    throw new Error("Enter a positive whole-number equipment ID.");
  }
  return BigInt(value);
}

async function refreshItems() {
  requireConnection();
  const count = await contract.count();
  $("items").replaceChildren();

  for (let id = 1n; id <= count; id++) {
    const [name, borrower, state] = await contract.getItem(id);
    const row = document.createElement("tr");

    const values = [
      id.toString(),
      name,
      statuses[Number(state)],
      borrower === ethers.ZeroAddress ? "None" : borrower
    ];

    for (const value of values) {
      const cell = document.createElement("td");
      cell.textContent = value;
      row.appendChild(cell);
    }

    $("items").appendChild(row);
  }
}

async function connect() {
  contract = null;

  if (!window.ethereum) throw new Error("Install MetaMask first.");
  if (!ethers.isAddress(ADDRESS)) {
    throw new Error("Set your deployed contract address in app.js.");
  }

  await window.ethereum.request({ method: "eth_requestAccounts" });

  const provider = new ethers.BrowserProvider(window.ethereum);
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

  const address = await signer.getAddress();
  const admin = await contract.admin();
  const role = address.toLowerCase() === admin.toLowerCase()
    ? "Administrator" : "Student";

  $("wallet").textContent = `${address} | ${role} | Sepolia`;
  await refreshItems();
  $("message").textContent = "Connected.";
}

async function write(method, args) {
  requireConnection();
  const tx = await contract[method](...args);
  $("message").textContent = `Waiting for confirmation:\n${tx.hash}`;

  try {
    await tx.wait();
  } catch (error) {
    throw new Error(
      `Transaction failed: ${tx.hash}\n` +
      (error.shortMessage || error.message)
    );
  }

  await refreshItems();
  $("message").textContent = `Transaction confirmed:\n${tx.hash}`;
}

$("connect").onclick = () => run(connect);

$("refresh").onclick = () => run(async () => {
  await refreshItems();
  $("message").textContent = "Equipment refreshed.";
});

$("add").onclick = () => run(async () => {
  const name = $("name").value.trim();
  if (!name) throw new Error("Enter an equipment name.");
  await write("addEquipment", [name, { gasLimit: 800000n }]);
});

$("borrow").onclick = () =>
  run(() => write("borrowEquipment", [selectedId(), { gasLimit: 800000n }]));

$("request").onclick = () =>
  run(() => write("requestReturn", [selectedId(), { gasLimit: 800000n }]));

$("confirm").onclick = () =>
  run(() => write("confirmReturn", [selectedId(), { gasLimit: 800000n }]));

window.ethereum?.on("accountsChanged", () => location.reload());
window.ethereum?.on("chainChanged", () => location.reload());