// SPDX-License-Identifier: MIT

pragma solidity ^0.8.0;

import "../libraries/StringUtils.sol";

contract OddEvenGame {
    using StringUtils for string;

    enum GameStatus {
        NOT_STARTED,
        WAITING_FOR_PLAYER_EVEN_TO_JOIN,
        WAITING_FOR_PLAYER_ODD_TO_REVEAL,
        FINISHED
    }

    struct Game {
        // Store the game status
        GameStatus status;
        // Store the player's address
        address payable playerOdd;
        address payable playerEven;
        address payable judge;
        // The cost of the game at the time of creation
        uint256 cost;
        // Store the magic word, player odd will save the hash of the word to prevent player even from cheating
        string magicWordOdd;
        bytes32 hashOdd;
        string magicWordEven;
        // Actually we don't need to store the hash of the even player's word, because after player even joins, player odd will reveal / judge will end the game in the next step.
        // total length of magic word from player odd + magic word from player even
        uint256 totalLength;
        // Store the game time
        uint256 startTime;
        uint256 playerEvenJoinedTime;
        uint256 endTime;
    }

    Game[] public games;

    address public owner;

    uint256 public maxWaitingTime;
    uint256 public gameCost;
    uint256 public judgeRewardPercentage; // judge reward percentage in gwei

    constructor(
        uint256 _gameCost,
        uint256 _maxWaitingTime,
        uint256 _judgeRewardPercentage
    ) {
        owner = msg.sender;
        gameCost = _gameCost;
        maxWaitingTime = _maxWaitingTime;
        judgeRewardPercentage = _judgeRewardPercentage;
    }

    function setGameCost(uint256 _gameCost) external onlyOwner {
        gameCost = _gameCost;
    }

    function setmaxWaitingTime(uint256 _maxWaitingTime) external onlyOwner {
        maxWaitingTime = _maxWaitingTime;
    }

    function setJudgeRewardPercentage(uint256 _judgeRewardPercentage)
        external
        onlyOwner
    {
        judgeRewardPercentage = _judgeRewardPercentage;
    }

    function getGames() public view returns (Game[] memory) {
        return games;
    }

    function startGame(bytes32 _hash) external payable noOngoingGames {
        require(msg.value == gameCost, "You must pay for the game");
        require(_hash.length > 0, "Invalid hash");

        Game memory game = Game({
            status: GameStatus.WAITING_FOR_PLAYER_EVEN_TO_JOIN,
            playerOdd: payable(msg.sender),
            playerEven: payable(address(0)),
            judge: payable(address(0)),
            cost: gameCost,
            magicWordOdd: "",
            hashOdd: _hash,
            magicWordEven: "",
            totalLength: 0,
            startTime: block.timestamp,
            playerEvenJoinedTime: 0,
            endTime: 0
        });

        games.push(game);
    }

    function joinGame(string memory _magicWord)
        external
        payable
        hasGame
        allowJoin
    {
        require(bytes(_magicWord).length > 0, "Invalid magic word");

        Game storage game = games[getLastGameIndex()];
        require(msg.value == game.cost, "You must pay for the game");

        game.status = GameStatus.WAITING_FOR_PLAYER_ODD_TO_REVEAL;
        game.playerEven = payable(msg.sender);
        game.magicWordEven = _magicWord;
        game.playerEvenJoinedTime = block.timestamp;
        game.endTime = block.timestamp + maxWaitingTime;
    }

    function reveal(string calldata _magicWord) external hasGame allowReveal {
        Game storage game = games[getLastGameIndex()];
        require(
            keccak256(abi.encodePacked(_magicWord)) == game.hashOdd,
            "Invalid magic word"
        );

        game.magicWordOdd = _magicWord;

        // Determine the game result
        uint256 totalLength = game.magicWordOdd.strlen() +
            game.magicWordEven.strlen();

        if (totalLength % 2 == 0) {
            // Even Wins

            // Transfer the money to player even
            (bool sent, ) = game.playerEven.call{value: gameCost * 2}("");
            require(sent, "Failed to send money to player even");
        } else {
            // Odd Wins

            // Transfer the money to player even
            (bool sent, ) = game.playerOdd.call{value: gameCost * 2}("");
            require(sent, "Failed to send money to player odd");
        }

        game.totalLength = totalLength;
        game.status = GameStatus.FINISHED;
    }

    function judge() external hasGame allowJudge {
        Game storage game = games[getLastGameIndex()];

        // allowJudge has determined that player odd did not reveal the magic word, so player even wins

        game.judge = payable(msg.sender);

        uint256 totalGameCost = game.cost * 2; // player odd + player even

        if (msg.sender == game.playerEven) {
            // Player even judge the game, no need to send the money twice

            // Send the money to player even
            (bool sentToPlayerEven, ) = payable(msg.sender).call{
                value: totalGameCost
            }("");

            require(sentToPlayerEven, "Failed to send money to player even");
        } else {
            // Calculate the judge reward
            uint256 judgeReward = (totalGameCost * judgeRewardPercentage) /
                1 gwei;

            // Send the money to judge
            (bool sentToJudge, ) = payable(msg.sender).call{value: judgeReward}(
                ""
            );

            require(sentToJudge, "Failed to send money to judge");

            // Send the money to player even
            (bool sentToPlayerEven, ) = payable(game.playerEven).call{
                value: totalGameCost - judgeReward
            }("");

            require(sentToPlayerEven, "Failed to send money to player even");
        }

        game.status = GameStatus.FINISHED;
    }

    function getLastGameIndex() public view returns (uint256) {
        return games.length - 1;
    }

    modifier onlyOwner() {
        require(msg.sender == owner, "Only the owner can call this function.");
        _;
    }

    modifier hasGame() {
        require(games.length > 0, "No games to join");
        _;
    }

    modifier noOngoingGames() {
        if (games.length > 0) {
            Game memory lastGame = games[getLastGameIndex()];
            require(
                lastGame.status == GameStatus.FINISHED,
                "There is an ongoing game"
            );
        }

        _;
    }

    modifier allowJoin() {
        uint256 lastIndex = getLastGameIndex();

        require(lastIndex >= 0, "There is no ongoing game");

        Game memory lastGame = games[lastIndex];
        require(
            lastGame.status == GameStatus.WAITING_FOR_PLAYER_EVEN_TO_JOIN,
            "No games can be joined"
        );

        _;
    }

    modifier allowReveal() {
        uint256 lastIndex = getLastGameIndex();

        require(lastIndex >= 0, "There is no ongoing game");

        Game memory lastGame = games[lastIndex];
        require(
            lastGame.status == GameStatus.WAITING_FOR_PLAYER_ODD_TO_REVEAL,
            "No games can be revealed"
        );

        require(msg.sender == lastGame.playerOdd, "Only player odd can reveal");

        _;
    }

    modifier allowJudge() {
        uint256 lastIndex = getLastGameIndex();

        require(lastIndex >= 0, "There is no ongoing game");

        Game memory lastGame = games[lastIndex];
        require(
            lastGame.status == GameStatus.WAITING_FOR_PLAYER_ODD_TO_REVEAL,
            "No games can be revealed"
        );

        require(
            lastGame.endTime < block.timestamp,
            "Game has not ended yet, cannot be judged at the moment"
        );

        _;
    }
}
