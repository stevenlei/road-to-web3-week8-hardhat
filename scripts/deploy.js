const main = async () => {
  const OddEvenGame = await hre.ethers.getContractFactory("OddEvenGame");

  const gameCost = hre.ethers.utils.parseEther("0.001");
  const maxWaitingTime = 60 * 60; // 1 hour
  const judgeReward = hre.ethers.utils.parseUnits("0.05", "gwei"); // 5%

  const oddEvenGame = await OddEvenGame.deploy(gameCost, maxWaitingTime, judgeReward);
  await oddEvenGame.deployed();

  console.log(`OddEvenGame deployed at ${oddEvenGame.address}`);
};

main().then().catch(console.error);
