// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

contract EquipmentLending {
    enum Status { Available, Borrowed, ReturnRequested }

    struct Equipment {
        string name;
        address borrower;
        Status status;
    }

    address public immutable admin;
    uint256 public count;
    mapping(uint256 => Equipment) private items;

    event EquipmentAdded(uint256 indexed id, string name);
    event EquipmentBorrowed(uint256 indexed id, address indexed borrower);
    event ReturnRequested(uint256 indexed id, address indexed borrower);
    event ReturnConfirmed(uint256 indexed id, address indexed borrower);

    constructor() {
        admin = msg.sender;
    }

    modifier onlyAdmin() {
        require(msg.sender == admin, "Admin only");
        _;
    }

    modifier validItem(uint256 id) {
        require(id > 0 && id <= count, "Invalid equipment ID");
        _;
    }

    function addEquipment(string calldata name) external onlyAdmin {
        require(
            bytes(name).length > 0 && bytes(name).length <= 80,
            "Name must contain 1-80 bytes"
        );

        count++;
        items[count] = Equipment(name, address(0), Status.Available);
        emit EquipmentAdded(count, name);
    }

    function borrowEquipment(uint256 id) external validItem(id) {
        Equipment storage item = items[id];
        require(item.status == Status.Available, "Equipment unavailable");

        item.borrower = msg.sender;
        item.status = Status.Borrowed;
        emit EquipmentBorrowed(id, msg.sender);
    }

    function requestReturn(uint256 id) external validItem(id) {
        Equipment storage item = items[id];
        require(item.borrower == msg.sender, "Borrower only");
        require(item.status == Status.Borrowed, "Not awaiting return request");

        item.status = Status.ReturnRequested;
        emit ReturnRequested(id, msg.sender);
    }

    function confirmReturn(uint256 id)
        external
        onlyAdmin
        validItem(id)
    {
        Equipment storage item = items[id];
        require(
            item.status == Status.ReturnRequested,
            "Return not requested"
        );

        address previousBorrower = item.borrower;
        item.borrower = address(0);
        item.status = Status.Available;
        emit ReturnConfirmed(id, previousBorrower);
    }

    function getItem(uint256 id)
        external
        view
        validItem(id)
        returns (string memory name, address borrower, Status status)
    {
        Equipment storage item = items[id];
        return (item.name, item.borrower, item.status);
    }
}