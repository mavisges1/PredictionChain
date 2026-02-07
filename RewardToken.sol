// SPDX-License-Identifier: MIT
pragma solidity ^0.8.31;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";

contract RewardToken is ERC20 {

    address public market;

    constructor() ERC20("Prediction Reward", "PRED") {}

    function setMarket(address _market) external {
        require(market == address(0), "Market already set");
        market = _market;
    }

    function mint(address to, uint256 amount) external {
        require(msg.sender == market, "Only market can mint");
        _mint(to, amount);
    }
}
