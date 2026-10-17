const assert = require("node:assert/strict");
const { ethers } = require("hardhat");

async function expectRevert(promise, reason) {
  await assert.rejects(promise, error => {
    const message = `${error.message || ""} ${error.shortMessage || ""}`;
    assert.match(message, new RegExp(reason.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
    return true;
  });
}

describe("EquipmentLending", function () {
  let admin;
  let student;
  let otherStudent;
  let equipment;

  beforeEach(async function () {
    [admin, student, otherStudent] = await ethers.getSigners();
    const factory = await ethers.getContractFactory("EquipmentLending");
    equipment = await factory.deploy();
    await equipment.waitForDeployment();
  });

  it("sets the deploying wallet as admin and starts with no equipment", async function () {
    assert.equal(await equipment.admin(), admin.address);
    assert.equal(await equipment.count(), 0n);
  });

  it("lets the admin add equipment and returns the saved item", async function () {
    await equipment.addEquipment("Campus camera");

    assert.equal(await equipment.count(), 1n);
    assert.deepEqual(
      [...(await equipment.getItem(1n))],
      ["Campus camera", ethers.ZeroAddress, 0n]
    );
  });

  it("rejects empty or overlong equipment names", async function () {
    await expectRevert(equipment.addEquipment(""), "Name must contain 1-80 bytes");
    await expectRevert(equipment.addEquipment("x".repeat(81)), "Name must contain 1-80 bytes");
  });

  it("rejects equipment registration by a non-admin", async function () {
    await expectRevert(
      equipment.connect(student).addEquipment("Campus camera"),
      "Admin only"
    );
  });

  it("rejects invalid IDs when borrowing or reading an item", async function () {
    await expectRevert(equipment.connect(student).borrowEquipment(1n), "Invalid equipment ID");
    await expectRevert(equipment.getItem(0n), "Invalid equipment ID");
  });

  it("lets a student borrow an available item and records the borrower", async function () {
    await equipment.addEquipment("Campus camera");
    await equipment.connect(student).borrowEquipment(1n);

    assert.deepEqual(
      [...(await equipment.getItem(1n))],
      ["Campus camera", student.address, 1n]
    );
  });

  it("prevents a second wallet from borrowing an item that is already borrowed", async function () {
    await equipment.addEquipment("Campus camera");
    await equipment.connect(student).borrowEquipment(1n);

    await expectRevert(
      equipment.connect(otherStudent).borrowEquipment(1n),
      "Equipment unavailable"
    );
  });

  it("allows only the current borrower to request a return", async function () {
    await equipment.addEquipment("Campus camera");
    await equipment.connect(student).borrowEquipment(1n);

    await expectRevert(
      equipment.connect(otherStudent).requestReturn(1n),
      "Borrower only"
    );
    await equipment.connect(student).requestReturn(1n);
    assert.equal((await equipment.getItem(1n))[2], 2n);
  });

  it("rejects a return request unless the item is currently borrowed", async function () {
    await equipment.addEquipment("Campus camera");
    await equipment.connect(student).borrowEquipment(1n);
    await equipment.connect(student).requestReturn(1n);
    await expectRevert(
      equipment.connect(student).requestReturn(1n),
      "Not awaiting return request"
    );
  });

  it("requires an admin and a pending request to confirm a return", async function () {
    await equipment.addEquipment("Campus camera");
    await equipment.connect(student).borrowEquipment(1n);

    await expectRevert(
      equipment.connect(student).confirmReturn(1n),
      "Admin only"
    );
    await expectRevert(equipment.confirmReturn(1n), "Return not requested");
  });

  it("makes an item available and clears its borrower after admin confirmation", async function () {
    await equipment.addEquipment("Campus camera");
    await equipment.connect(student).borrowEquipment(1n);
    await equipment.connect(student).requestReturn(1n);
    await equipment.confirmReturn(1n);

    assert.deepEqual(
      [...(await equipment.getItem(1n))],
      ["Campus camera", ethers.ZeroAddress, 0n]
    );
  });
});
