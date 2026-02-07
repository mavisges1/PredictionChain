// SPDX-License-Identifier: MIT
pragma solidity ^0.8.31;

interface IRewardToken {
    function mint(address to, uint256 amount) external;
}

contract PredictionMarket {

    struct EventData {
        string title;
        uint256 deadline;
        uint8 optionsCount;
        uint256 totalPool;
        bool finalized;
        uint8 winningOption;
    }

    address public owner;
    IRewardToken public rewardToken;
    uint256 public nextEventId;

    mapping(uint256 => EventData) public eventsData;
    mapping(uint256 => mapping(uint8 => uint256)) public optionPool;
    mapping(uint256 => mapping(address => uint256)) public userBet;
    mapping(uint256 => mapping(address => uint8)) public userOption;
    mapping(uint256 => mapping(address => bool)) public claimed;

    event EventCreated(uint256 id, string title);
    event BetPlaced(uint256 id, address user, uint8 option, uint256 amount);
    event EventFinalized(uint256 id, uint8 winningOption);
    event Claimed(uint256 id, address user, uint256 payout);

    modifier onlyOwner() {
        require(msg.sender == owner, "Not owner");
        _;
    }

    constructor(address rewardTokenAddress) {
        owner = msg.sender;
        rewardToken = IRewardToken(rewardTokenAddress);
    }

    function createEvent(
        string calldata title,
        uint256 deadline,
        uint8 optionsCount
    ) external onlyOwner {
        require(deadline > block.timestamp, "Deadline in past");
        require(optionsCount >= 2, "Min 2 options");

        eventsData[nextEventId] = EventData(
            title,
            deadline,
            optionsCount,
            0,
            false,
            0
        );

        emit EventCreated(nextEventId, title);
        nextEventId++;
    }

    function bet(uint256 eventId, uint8 option) external payable {
        EventData storage ev = eventsData[eventId];

        require(block.timestamp < ev.deadline, "Event ended");
        require(!ev.finalized, "Finalized");
        require(option < ev.optionsCount, "Invalid option");
        require(msg.value > 0, "Zero bet");

        ev.totalPool += msg.value;
        optionPool[eventId][option] += msg.value;

        if (userBet[eventId][msg.sender] == 0) {
            userOption[eventId][msg.sender] = option;
        } else {
            require(userOption[eventId][msg.sender] == option, "One option only");
        }

        userBet[eventId][msg.sender] += msg.value;

        rewardToken.mint(msg.sender, msg.value * 1000);

        emit BetPlaced(eventId, msg.sender, option, msg.value);
    }

    function finalize(uint256 eventId, uint8 winningOption) external onlyOwner {
        EventData storage ev = eventsData[eventId];

        require(block.timestamp >= ev.deadline, "Too early");
        require(!ev.finalized, "Already finalized");
        require(winningOption < ev.optionsCount, "Invalid option");

        ev.finalized = true;
        ev.winningOption = winningOption;

        emit EventFinalized(eventId, winningOption);
    }

    function claim(uint256 eventId) external {
        EventData storage ev = eventsData[eventId];

        require(ev.finalized, "Not finalized");
        require(!claimed[eventId][msg.sender], "Already claimed");

        claimed[eventId][msg.sender] = true;

        uint256 betAmount = userBet[eventId][msg.sender];
        require(betAmount > 0, "No bet");

        if (userOption[eventId][msg.sender] != ev.winningOption) {
            emit Claimed(eventId, msg.sender, 0);
            return;
        }

        uint256 winnersPool = optionPool[eventId][ev.winningOption];
        uint256 payout = (ev.totalPool * betAmount) / winnersPool;

        (bool success, ) = payable(msg.sender).call{value: payout}("");
        require(success, "Transfer failed");
        emit Claimed(eventId, msg.sender, payout);
    }
}
