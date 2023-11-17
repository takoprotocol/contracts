import { expect } from "chai";
import {
  deployer,
  lensHubMock,
  makeSuiteCleanRoom,
  erc20Token,
  testWallet,
  user,
  user1,
  users,
  lensFreeCollectModule,
  takoOpenLensHub,
} from "./__setup.spec";
import { ERRORS } from "./helpers/errors";
import {
  ADDRESS_ZERO,
  EVMMine,
  EVMIncreaseTime,
  AuditStatus,
} from "./shared/utils";
import { ethers } from "hardhat";
import { getLoanWithSigParts } from "./shared/sign";

const BID_AMOUNT = 100000;
const DAY = 86400;
const FEE_DENOMINATOR = 10000000000;
const DURATION = 2 * DAY;
const CLAIM_BACK_TIME = 7 * DAY;

let officialFeeRate = 0;
let profileOwner = users[0];
let profileOwner1 = users[1];
let relayer = testWallet;
const contentId = "0x01-01";

makeSuiteCleanRoom("TakoOpenLensHub", () => {
  context("Gov", () => {
    beforeEach(async () => {
      await init();
    });
    it("Should fail to set whitelist token if sender does not own the contract", async () => {
      await expect(
        takoOpenLensHub.connect(user).whitelistBidToken(ADDRESS_ZERO, true)
      ).to.be.reverted;
    });
    it("Should fail to set whitelist relayer if sender does not own the contract", async () => {
      await expect(
        takoOpenLensHub
          .connect(user)
          .whitelistBidToken(await user1.getAddress(), true)
      ).to.be.reverted;
    });
    it("Should fail to set fee collector if sender does not own the contract", async () => {
      await expect(
        takoOpenLensHub
          .connect(user)
          .setFeeCollector(deployer.getAddress(), 100000000)
      ).to.be.reverted;
    });
    it("Should success to set whitelist relayer", async () => {
      await expect(
        takoOpenLensHub
          .connect(deployer)
          .whitelistBidToken(await user.getAddress(), true)
      ).to.not.reverted;
    });
    it("Should success to set fee collector", async () => {
      await expect(
        takoOpenLensHub
          .connect(deployer)
          .setFeeCollector(deployer.getAddress(), 100000000)
      ).to.not.reverted;
    });
  });

  context("User bid", () => {
    beforeEach(async () => {
      await init();
    });
    it("Should fail to bid if insufficient input amount", async () => {
      await expect(
        takoOpenLensHub
          .connect(user)
          .bid(getBidBaseParams(), getMerkleBaseData(), {
            value: BID_AMOUNT - 1,
          })
      ).to.revertedWith(ERRORS.INSUFFICIENT_INPUT_AMOUNT);
    });
    it("Should fail to bid if the bid token not whitelisted", async () => {
      await expect(
        takoOpenLensHub.connect(user).bid(
          {
            contentId,
            bidToken: erc20Token.address,
            bidAmount: BID_AMOUNT,
          },
          getMerkleBaseData()
        )
      ).to.revertedWith(ERRORS.BID_TOKEN_NOT_WHITELISTED);
    });
    it("Should success to bid", async () => {
      await expect(
        takoOpenLensHub
          .connect(user)
          .bid(getBidBaseParams(), getMerkleBaseData(), {
            value: BID_AMOUNT,
          })
      ).to.not.reverted;
      expect(await takoOpenLensHub.getBidCounter()).to.eq(1);
    });
  });

  context("User update bid evm", () => {
    beforeEach(async () => {
      await init();
      await initBid();
    });
    it("Should success to update bid", async () => {
      await expect(takoOpenLensHub.connect(user).updateBid(1, 1, { value: 1 }))
        .to.not.reverted;
      expect((await takoOpenLensHub.getContentByIndex(1)).bidAmount).to.eq(
        BID_AMOUNT + 1
      );
    });
  });

  context("User bid batch", () => {
    beforeEach(async () => {
      await init();
    });
    it("Should fail to bid batch if insufficient input amount", async () => {
      await expect(
        takoOpenLensHub
          .connect(user)
          .bidBatch(
            [getBidBaseParams(), getBidBaseParams()],
            getMerkleBaseData(),
            {
              value: BID_AMOUNT,
            }
          )
      ).to.revertedWith(ERRORS.INSUFFICIENT_INPUT_AMOUNT);
    });
    it("Should success to bid batch", async () => {
      await expect(
        takoOpenLensHub
          .connect(user)
          .bidBatch(
            [getBidBaseParams(), getBidBaseParams()],
            getMerkleBaseData(),
            {
              value: BID_AMOUNT * 2,
            }
          )
      ).to.not.reverted;
      expect(await takoOpenLensHub.getBidCounter()).to.eq(2);
    });
  });

  context("User cancel bid", () => {
    beforeEach(async () => {
      await init();
      await initBid();
    });
    it("Should fail to cancel bid if index error", async () => {
      await expect(
        takoOpenLensHub.connect(user).claimBackBid(10)
      ).to.revertedWith(ERRORS.PARAMS_INVALID);
    });
    it("Should fail to cancel bid if not bidder", async () => {
      await expect(
        takoOpenLensHub.connect(user1).claimBackBid(1)
      ).to.revertedWith(ERRORS.NOT_BIDDER);
    });
    it("Should fail to cancel bid if not expired", async () => {
      await EVMIncreaseTime(DURATION);
      await EVMMine();
      await expect(
        takoOpenLensHub.connect(user).claimBackBid(1)
      ).to.revertedWith(ERRORS.NOT_EXPIRED);
    });
    it("Should fail to cancel bid if bid closed", async () => {
      await EVMIncreaseTime(DURATION + CLAIM_BACK_TIME);
      await EVMMine();

      const deadline = new Date().getTime() + DAY;
      await expect(
        takoOpenLensHub
          .connect(deployer)
          .whitelistRelayer(await relayer.getAddress(), true)
      ).to.not.reverted;
      const { v, r, s } = await getLoanWithSigParts(
        1,
        await profileOwner.getAddress(),
        contentId,
        deadline,
        takoOpenLensHub.address,
        await takoOpenLensHub.name()
      );
      await expect(
        takoOpenLensHub
          .connect(profileOwner)
          .loanWithSig(1, 1, testWallet.address, contentId, {
            v,
            r,
            s,
            deadline,
          })
      ).to.not.reverted;
      await expect(
        takoOpenLensHub.connect(user).claimBackBid(1)
      ).to.revertedWith(ERRORS.BID_IS_CLOSE);
    });
    it("Should success to cancel bid", async () => {
      await EVMIncreaseTime(DURATION + CLAIM_BACK_TIME);
      await EVMMine();
      await expect(
        takoOpenLensHub.connect(user).claimBackBid(1)
      ).to.changeEtherBalances(
        [user, takoOpenLensHub],
        [BID_AMOUNT, -BID_AMOUNT]
      );
      await expect(
        takoOpenLensHub.connect(user).claimBackBidBatch([2, 3])
      ).to.changeEtherBalances(
        [user, takoOpenLensHub],
        [BID_AMOUNT * 2, -BID_AMOUNT * 2]
      );
    });
  });

  context("Loan", async () => {
    const deadline = new Date().getTime() + DAY;
    let v: number;
    let r: string;
    let s: string;
    beforeEach(async () => {
      await init();
      await initBid();
      await expect(
        takoOpenLensHub
          .connect(deployer)
          .whitelistRelayer(await relayer.getAddress(), true)
      ).to.not.reverted;
      ({
        v: v,
        r: r,
        s: s,
      } = await getLoanWithSigParts(
        1,
        await profileOwner.getAddress(),
        contentId,
        deadline,
        takoOpenLensHub.address,
        await takoOpenLensHub.name()
      ));
    });
    it("Should fail to loan if the index error", async () => {
      await expect(
        takoOpenLensHub
          .connect(profileOwner)
          .loanWithSig(10, 1, relayer.address, contentId, { v, r, s, deadline })
      ).to.revertedWith(ERRORS.PARAMS_INVALID);
    });
    it("Should fail to loan if the bid is close", async () => {
      await EVMIncreaseTime(DURATION + CLAIM_BACK_TIME);
      await EVMMine();
      await expect(takoOpenLensHub.connect(user).claimBackBid(1)).to.not
        .reverted;
      await expect(
        takoOpenLensHub
          .connect(profileOwner)
          .loanWithSig(1, 1, relayer.address, contentId, { v, r, s, deadline })
      ).to.revertedWith(ERRORS.BID_IS_CLOSE);
    });
    it("Should fail to loan if the sig error", async () => {
      await expect(
        takoOpenLensHub
          .connect(profileOwner1)
          .loanWithSig(1, 1, await profileOwner.getAddress(), contentId, {
            v,
            r,
            s,
            deadline,
          })
      ).to.reverted;
    });
    it("Should success to loan with sig", async () => {
      const officialFee = (BID_AMOUNT * officialFeeRate) / FEE_DENOMINATOR;
      await EVMIncreaseTime(DURATION);
      await EVMMine();
      await expect(
        takoOpenLensHub
          .connect(profileOwner)
          .loanWithSig(1, 1, relayer.address, contentId, {
            v,
            r,
            s,
            deadline,
          })
      ).to.changeEtherBalances(
        [deployer, profileOwner, takoOpenLensHub],
        [officialFee, BID_AMOUNT - officialFee, -BID_AMOUNT]
      );
      expect((await takoOpenLensHub.getContentByIndex(1)).status).to.eq(
        AuditStatus.Pass
      );
    });
    it("Should success to loan with relayer", async () => {
      await EVMIncreaseTime(DURATION);
      await EVMMine();
      await expect(
        takoOpenLensHub
          .connect(relayer)
          .loanWithRelayer(1, 1, user1.getAddress(), contentId)
      ).to.not.reverted;
    });
  });
});

async function init() {
  relayer = testWallet;
  profileOwner = users[0];
  profileOwner1 = users[1];
  officialFeeRate = (await takoOpenLensHub.feeRate()).toNumber();
  await expect(
    takoOpenLensHub
      .connect(deployer)
      .setGovernance(await deployer.getAddress(), true)
  ).to.not.reverted;
}

async function initBid() {
  await expect(
    takoOpenLensHub.connect(user).bid(getBidBaseParams(), getMerkleBaseData(), {
      value: BID_AMOUNT,
    })
  ).to.not.reverted;
  await expect(
    takoOpenLensHub.connect(user).bid(getBidBaseParams(), getMerkleBaseData(), {
      value: BID_AMOUNT,
    })
  ).to.not.reverted;
  await expect(
    takoOpenLensHub.connect(user).bid(getBidBaseParams(), getMerkleBaseData(), {
      value: BID_AMOUNT,
    })
  ).to.not.reverted;
}

function getBidBaseParams() {
  return {
    contentId,
    bidToken: ADDRESS_ZERO,
    bidAmount: BID_AMOUNT,
  };
}

function getMerkleBaseData(index?: number, merkleProof?: string[]) {
  return {
    index: index || 0,
    merkleProof: merkleProof || [],
  };
}

function getEmptySig() {
  return {
    v: 1,
    r: ethers.utils.formatBytes32String(""),
    s: ethers.utils.formatBytes32String(""),
    deadline: 1,
  };
}
