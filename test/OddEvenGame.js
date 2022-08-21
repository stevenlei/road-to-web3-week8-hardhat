const { loadFixture } = require("@nomicfoundation/hardhat-network-helpers");
const { expect } = require("chai");

describe("OddEvenGame", function () {
  async function deployOddEvenGameFixture() {
    const [owner, addr1, addr2] = await hre.ethers.getSigners();
    const OddEvenGame = await hre.ethers.getContractFactory("OddEvenGame");

    const gameCost = hre.ethers.utils.parseEther("0.001");
    const maxWaitingTime = 3; // 3 seconds in test case
    const judgeReward = hre.ethers.utils.parseUnits("0.05", "gwei"); // 5%

    const oddEvenGame = await OddEvenGame.deploy(gameCost, maxWaitingTime, judgeReward);
    await oddEvenGame.deployed();

    return { oddEvenGame, owner, addr1, addr2, gameCost, maxWaitingTime, judgeReward };
  }

  describe("Deployment", function () {
    it("Should have the correct settings", async function () {
      const { oddEvenGame, owner, gameCost, maxWaitingTime, judgeReward } = await loadFixture(deployOddEvenGameFixture);

      expect(await oddEvenGame.owner()).to.equal(owner.address);
      expect(await oddEvenGame.gameCost()).to.equal(gameCost);
      expect(await oddEvenGame.maxWaitingTime()).to.equal(maxWaitingTime);
      expect(await oddEvenGame.judgeRewardPercentage()).to.equal(judgeReward);
      expect((await oddEvenGame.getGames()).length).to.equal(0);
    });
  });

  describe("Game", function () {
    it("Should be able to start a game", async function () {
      const { oddEvenGame, owner, gameCost } = await loadFixture(deployOddEvenGameFixture);

      const word = "hello";
      const wordHash = hre.ethers.utils.id(word);

      await expect(oddEvenGame.startGame(wordHash)).to.revertedWith("You must pay for the game");

      const tx = await oddEvenGame.startGame(wordHash, {
        value: gameCost,
      });

      const game = await oddEvenGame.games(0);

      expect(game.playerOdd).to.equal(owner.address);
      expect(game.cost).to.equal(gameCost);
      expect(game.hashOdd).to.equal(wordHash);
    });

    it("Should be able to join a game", async function () {
      const { oddEvenGame, owner, addr1, addr2, gameCost } = await loadFixture(deployOddEvenGameFixture);

      // Start a game by addr1
      const word = "hello";
      const wordHash = hre.ethers.utils.id(word);

      const tx = await oddEvenGame.connect(addr1).startGame(wordHash, {
        value: gameCost,
      });

      const wordEven = "world";

      await expect(oddEvenGame.connect(addr2).joinGame(wordEven)).to.revertedWith("You must pay for the game");

      // Join a game by addr2
      const tx2 = await oddEvenGame.connect(addr2).joinGame(wordEven, {
        value: gameCost,
      });

      const game = await oddEvenGame.games(0);

      expect(game.playerEven).to.equal(addr2.address);
      expect(game.magicWordEven).to.equal(wordEven);
    });

    it("Should be able to reveal the word by player odd", async function () {
      const { oddEvenGame, owner, addr1, addr2, gameCost } = await loadFixture(deployOddEvenGameFixture);

      // Start a game by addr1
      const word = "hello";
      const wordHash = hre.ethers.utils.id(word);

      const tx = await oddEvenGame.connect(addr1).startGame(wordHash, {
        value: gameCost,
      });

      const wordEven = "world";

      await expect(oddEvenGame.connect(addr2).joinGame(wordEven)).to.revertedWith("You must pay for the game");

      // Join a game by addr2
      await oddEvenGame.connect(addr2).joinGame(wordEven, {
        value: gameCost,
      });

      // Shouldn't be able to reveal the word by player even
      await expect(oddEvenGame.connect(addr2).reveal(word)).to.revertedWith("Only player odd can reveal");

      // Player even should win, get the balance before revealing
      const balanceBefore = await hre.ethers.provider.getBalance(addr2.address);

      // Reveal the word by addr1
      const revealTx = await oddEvenGame.connect(addr1).reveal(word);
      const game = await oddEvenGame.games(0);

      expect(game.magicWordOdd).to.equal(word);
      expect(game.totalLength).to.equal(word.length + wordEven.length);
      expect(await hre.ethers.provider.getBalance(addr2.address)).to.equal(balanceBefore.add(gameCost * 2));

      // ============== Second Game ==============
      // Start a game by addr1
      const word2 = "hi";
      const word2Hash = hre.ethers.utils.id(word2);

      const tx2 = await oddEvenGame.connect(addr1).startGame(word2Hash, {
        value: gameCost,
      });

      expect((await oddEvenGame.getGames()).length).to.equal(2);

      const word2Even = "world";

      // Join a game by addr2
      await oddEvenGame.connect(addr2).joinGame(word2Even, {
        value: gameCost,
      });

      // Player odd should win, get the balance before revealing
      const balance2Before = await hre.ethers.provider.getBalance(addr1.address);

      // Reveal the word by addr1
      const reveal2Tx = await oddEvenGame.connect(addr1).reveal(word2);
      const receipt = await reveal2Tx.wait();
      const gasSpent = receipt.gasUsed.mul(receipt.effectiveGasPrice);

      const game2 = await oddEvenGame.games(1);

      expect(game2.magicWordOdd).to.equal(word2);
      expect(game2.totalLength).to.equal(word2.length + word2Even.length);
      expect(await hre.ethers.provider.getBalance(addr1.address)).to.equal(
        balance2Before.add(gameCost * 2).sub(gasSpent)
      );
    });

    it("Should be able to end by judge for expired game", async function () {
      const { oddEvenGame, owner, addr1, addr2, gameCost, maxWaitingTime } = await loadFixture(
        deployOddEvenGameFixture
      );

      // Start a game by addr1
      const word = "hello";
      const wordHash = hre.ethers.utils.id(word);

      const tx = await oddEvenGame.connect(addr1).startGame(wordHash, {
        value: gameCost,
      });

      const wordEven = "world";

      // Join a game by addr2
      await oddEvenGame.connect(addr2).joinGame(wordEven, {
        value: gameCost,
      });

      // Wait for the game to expire, player odd is not going to reveal
      await wait((maxWaitingTime + 1) * 1000);

      // Get the balance of judge
      const balanceJudgeBefore = await hre.ethers.provider.getBalance(owner.address);

      // Get the balance of player even
      const balancePlayerEvenBefore = await hre.ethers.provider.getBalance(addr2.address);

      // Judge call the judge() method
      const judgeTx = await oddEvenGame.connect(owner).judge();
      const receipt = await judgeTx.wait();
      const gasSpent = receipt.gasUsed.mul(receipt.effectiveGasPrice);

      const reward = hre.ethers.BigNumber.from(gameCost).mul(2).mul(5).div(100); // 5%
      const winPrice = hre.ethers.BigNumber.from(gameCost).mul(2).sub(reward);

      // // Judge should receive the reward
      expect(await hre.ethers.provider.getBalance(owner.address)).to.equal(
        balanceJudgeBefore.add(reward).sub(gasSpent)
      );

      // Player even should receive the winPrice
      expect(await hre.ethers.provider.getBalance(addr2.address)).to.equal(balancePlayerEvenBefore.add(winPrice));
    });
  });
});

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
