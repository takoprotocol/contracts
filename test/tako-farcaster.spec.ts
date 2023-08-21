import { expect } from "chai";
import {
  deployer,
  makeSuiteCleanRoom,
  erc20Token,
  testWallet,
  user,
  user1,
  users,
  takoFarcasterHub,
} from "./__setup.spec";
import { ERRORS } from "./helpers/errors";
import {
  ADDRESS_ZERO,
  AuditStatus,
  EVMMine,
  EVMIncreaseTime,
} from "./shared/utils";
import { getLoanWithSigParts, getVerifiedCuratorsData } from "./shared/sign";

const BID_AMOUNT = 100000;
const DAY = 86400;
const FEE_DENOMINATOR = 10000000000;
let officialFeeRate = 0;
let fidOwner = users[0];
let fidOwner1 = users[1];
let relayer = testWallet;
const fid = 1;
const contentBaseId = "0x1";

makeSuiteCleanRoom("TakoFarcasterHub", () => {
  context("Gov", () => {
    beforeEach(async () => {
      await init();
    });
    it("Should fail to set whitelist token if sender does not own the contract", async () => {
      await expect(
        takoFarcasterHub.connect(user).whitelistBidToken(ADDRESS_ZERO, true)
      ).to.be.reverted;
    });
    it("Should fail to set whitelist relayer if sender does not own the contract", async () => {
      await expect(
        takoFarcasterHub
          .connect(user)
          .whitelistBidToken(await user1.getAddress(), true)
      ).to.be.reverted;
    });
    it("Should fail to set fee collector if sender does not own the contract", async () => {
      await expect(
        takoFarcasterHub
          .connect(user)
          .setFeeCollector(deployer.getAddress(), 100000000)
      ).to.be.reverted;
    });
    it("Should fail to set profile limit if sender does not own the contract", async () => {
      await expect(takoFarcasterHub.connect(user).setToCuratorLimit(20)).to
        .reverted;
    });
    it("Should success to set whitelist token", async () => {
      await expect(
        takoFarcasterHub
          .connect(deployer)
          .whitelistBidToken(erc20Token.address, true)
      ).to.not.reverted;
    });
    it("Should success to set whitelist relayer", async () => {
      await expect(
        takoFarcasterHub
          .connect(deployer)
          .whitelistBidToken(await user.getAddress(), true)
      ).to.not.reverted;
    });
    it("Should success to set fee collector", async () => {
      await expect(
        takoFarcasterHub
          .connect(deployer)
          .setFeeCollector(deployer.getAddress(), 100000000)
      ).to.not.reverted;
    });
    it("Should success to set profile limit", async () => {
      await expect(takoFarcasterHub.connect(deployer).setToCuratorLimit(20)).to
        .not.reverted;
    });
  });

  context("User bid", () => {
    beforeEach(async () => {
      await init();
    });
    it("Should fail to bid if the duration limit exceeded", async () => {
      const maxDuration = (await takoFarcasterHub.maxDuration()).toNumber();
      await expect(
        takoFarcasterHub.connect(user).bid(
          {
            contentURI: "",
            parentHash: "",
            bidToken: ADDRESS_ZERO,
            bidAmount: BID_AMOUNT,
            duration: DAY * maxDuration + DAY,
            toCurators: [fid],
          },
          0,
          await getVerifiedCurators(),
          getMerkleBaseData()
        )
      ).to.revertedWith(ERRORS.DURATION_LIMIT_EXCEEDED);
    });
    it("Should fail to bid if the to profile limit exceeded", async () => {
      const toCurators = [];
      for (let i = 0; i < 10; i++) {
        toCurators.push(i);
      }
      await expect(
        takoFarcasterHub
          .connect(user)
          .bid(
            getBidBaseParams(toCurators),
            0,
            await getVerifiedCurators(),
            getMerkleBaseData()
          )
      ).to.revertedWith(ERRORS.TO_CURATOR_LIMIT_EXCEEDED);
    });
    it("Should fail to bid if the amount not reached minimum", async () => {
      await expect(
        takoFarcasterHub
          .connect(fidOwner)
          .setMinBid(ADDRESS_ZERO, BID_AMOUNT + 1)
      ).to.not.reverted;
      await expect(
        takoFarcasterHub
          .connect(user)
          .bid(
            getBidBaseParams(),
            0,
            await getVerifiedCurators(),
            getMerkleBaseData(),
            {
              value: BID_AMOUNT,
            }
          )
      ).to.revertedWith(ERRORS.NOT_REACHED_MINIMUM);
    });
    it("Should fail to bid if insufficient input amount", async () => {
      await expect(
        takoFarcasterHub
          .connect(user)
          .bid(
            getBidBaseParams(),
            0,
            await getVerifiedCurators(),
            getMerkleBaseData(),
            {
              value: BID_AMOUNT - 1,
            }
          )
      ).to.revertedWith(ERRORS.INSUFFICIENT_INPUT_AMOUNT);
    });
    it("Should fail to bid if the bid token not whitelisted", async () => {
      await expect(
        takoFarcasterHub.connect(user).bid(
          {
            contentURI: "",
            parentHash: "",
            bidToken: erc20Token.address,
            bidAmount: BID_AMOUNT,
            duration: DAY,
            toCurators: [fid],
          },
          0,
          await getVerifiedCurators(),
          getMerkleBaseData()
        )
      ).to.revertedWith(ERRORS.BID_TOKEN_NOT_WHITELISTED);
    });
    it("Should fail to bid if the bid type not allowed", async () => {
      await expect(
        takoFarcasterHub
          .connect(fidOwner)
          .setDisableAuditTypes([true, false, false])
      ).to.not.reverted;
      await expect(
        takoFarcasterHub
          .connect(user)
          .bid(
            getBidBaseParams(),
            0,
            await getVerifiedCurators(),
            getMerkleBaseData(),
            {
              value: BID_AMOUNT,
            }
          )
      ).to.revertedWith(ERRORS.BID_TYPE_NOT_ACCEPT);
    });
    it("Should success to bid cast", async () => {
      await expect(
        takoFarcasterHub
          .connect(user)
          .bid(
            getBidBaseParams(),
            0,
            await getVerifiedCurators(),
            getMerkleBaseData(),
            {
              value: BID_AMOUNT,
            }
          )
      ).to.not.reverted;
      expect(await takoFarcasterHub.getBidCounter()).to.eq(1);
    });
    it("Should success to bid reply", async () => {
      await expect(
        takoFarcasterHub
          .connect(user)
          .bid(
            getBidBaseParams(),
            1,
            await getVerifiedCurators(),
            getMerkleBaseData(),
            {
              value: BID_AMOUNT,
            }
          )
      ).to.not.reverted;
      expect(await takoFarcasterHub.getBidCounter()).to.eq(1);
    });
    it("Should success to bid recast", async () => {
      await expect(
        takoFarcasterHub
          .connect(user)
          .bid(
            getBidBaseParams(),
            2,
            await getVerifiedCurators(),
            getMerkleBaseData(),
            {
              value: BID_AMOUNT,
            }
          )
      ).to.not.reverted;
      expect(await takoFarcasterHub.getBidCounter()).to.eq(1);
    });
  });

  context("User update bid", () => {
    beforeEach(async () => {
      await init();
      await initBid();
    });
    it("Should fail to update bid if the duration limit exceeded", async () => {
      const maxDuration = (await takoFarcasterHub.maxDuration()).toNumber();
      await expect(
        takoFarcasterHub.connect(user).updateBid(1, DAY * maxDuration + DAY, 0)
      ).to.revertedWith(ERRORS.DURATION_LIMIT_EXCEEDED);
    });
    it("Should fail to update bid if index error", async () => {
      await expect(
        takoFarcasterHub.connect(user).updateBid(4, DAY, 0)
      ).to.revertedWith(ERRORS.PARAMS_INVALID);
    });
    it("Should fail to update bid if bid is closed", async () => {
      await expect(
        takoFarcasterHub
          .connect(fidOwner)
          .loanWithSig(
            1,
            fid,
            relayer.address,
            contentBaseId,
            await getVerifiedCurators(),
            await getLoanWithSigData()
          )
      ).to.not.reverted;
      await expect(
        takoFarcasterHub
          .connect(user)
          .updateBid(1, DAY, BID_AMOUNT, { value: BID_AMOUNT })
      ).to.revertedWith(ERRORS.BID_IS_CLOSE);
    });
    it("Should fail to update bid if not bidder", async () => {
      await expect(
        takoFarcasterHub
          .connect(user1)
          .updateBid(1, DAY, BID_AMOUNT, { value: BID_AMOUNT })
      ).to.revertedWith(ERRORS.NOT_BIDDER);
    });
    it("Should fail to update bid if insufficient input amount", async () => {
      await expect(
        takoFarcasterHub
          .connect(user)
          .updateBid(1, DAY, BID_AMOUNT, { value: BID_AMOUNT - 1 })
      ).to.revertedWith(ERRORS.INSUFFICIENT_INPUT_AMOUNT);
    });
    it("Should success to update bid", async () => {
      await expect(
        takoFarcasterHub
          .connect(user)
          .updateBid(1, DAY, BID_AMOUNT, { value: BID_AMOUNT })
      ).to.not.reverted;
    });
  });

  context("User cancel bid", () => {
    beforeEach(async () => {
      await init();
      await initBid();
    });
    it("Should fail to cancel bid if index error", async () => {
      await expect(
        takoFarcasterHub.connect(user).claimBackBid(10)
      ).to.revertedWith(ERRORS.PARAMS_INVALID);
    });
    it("Should fail to cancel bid if not bidder", async () => {
      await expect(
        takoFarcasterHub.connect(user1).claimBackBid(1)
      ).to.revertedWith(ERRORS.NOT_BIDDER);
    });
    it("Should fail to cancel bid if not expired", async () => {
      await expect(
        takoFarcasterHub.connect(user).claimBackBid(1)
      ).to.revertedWith(ERRORS.NOT_EXPIRED);
    });
    it("Should fail to cancel bid if bid closed", async () => {
      await expect(
        takoFarcasterHub
          .connect(fidOwner)
          .loanWithSig(
            1,
            fid,
            relayer.address,
            contentBaseId,
            await getVerifiedCurators(),
            await getLoanWithSigData()
          )
      ).to.not.reverted;
      await EVMIncreaseTime(DAY * 2);
      await EVMMine();
      await expect(
        takoFarcasterHub.connect(user).claimBackBid(1)
      ).to.revertedWith(ERRORS.BID_IS_CLOSE);
    });
    it("Should success to cancel bid", async () => {
      await EVMIncreaseTime(DAY * 2);
      await EVMMine();
      await expect(
        takoFarcasterHub.connect(user).claimBackBid(1)
      ).to.changeEtherBalances(
        [user, takoFarcasterHub],
        [BID_AMOUNT, -BID_AMOUNT]
      );
      await expect(
        takoFarcasterHub.connect(user).claimBackBidBatch([2, 3])
      ).to.changeEtherBalances(
        [user, takoFarcasterHub],
        [BID_AMOUNT * 2, -BID_AMOUNT * 2]
      );
    });
  });

  context("Loan", async () => {
    beforeEach(async () => {
      await init();
      await initBid();
    });
    it("Should fail to loan if the index error", async () => {
      await expect(
        takoFarcasterHub
          .connect(fidOwner)
          .loanWithSig(
            10,
            fid,
            relayer.address,
            contentBaseId,
            await getVerifiedCurators(),
            await getLoanWithSigData()
          )
      ).to.revertedWith(ERRORS.PARAMS_INVALID);
    });
    it("Should fail to loan if the bid is close", async () => {
      await EVMIncreaseTime(DAY * 2);
      await EVMMine();
      await expect(takoFarcasterHub.connect(user).claimBackBid(1)).to.not
        .reverted;
      await expect(
        takoFarcasterHub
          .connect(fidOwner)
          .loanWithSig(
            1,
            fid,
            relayer.address,
            contentBaseId,
            await getVerifiedCurators(),
            await getLoanWithSigData()
          )
      ).to.revertedWith(ERRORS.BID_IS_CLOSE);
    });
    it("Should fail to loan if the profile error", async () => {
      await expect(
        takoFarcasterHub
          .connect(fidOwner1)
          .loanWithSig(
            1,
            fid,
            relayer.address,
            contentBaseId,
            await getVerifiedCurators(),
            await getLoanWithSigData()
          )
      ).to.revertedWith(ERRORS.NOT_PROFILE_OWNER);
    });
    it("Should fail to loan if the sig error", async () => {
      await expect(
        takoFarcasterHub
          .connect(fidOwner)
          .loanWithSig(
            1,
            fid,
            await relayer.getAddress(),
            contentBaseId,
            await getVerifiedCurators(),
            await getLoanWithSigData(2)
          )
      ).to.reverted;
    });
    it("Should success to loan with sig", async () => {
      const officialFee = (BID_AMOUNT * officialFeeRate) / FEE_DENOMINATOR;
      await expect(
        takoFarcasterHub
          .connect(fidOwner)
          .loanWithSig(
            1,
            fid,
            relayer.address,
            contentBaseId,
            await getVerifiedCurators(),
            await getLoanWithSigData()
          )
      ).to.changeEtherBalances(
        [deployer, fidOwner, takoFarcasterHub],
        [officialFee, BID_AMOUNT - officialFee, -BID_AMOUNT]
      );
      expect((await takoFarcasterHub.getContentByIndex(1)).status).to.eq(
        AuditStatus.Pass
      );
    });
  });
});

async function init() {
  relayer = testWallet;
  fidOwner = users[0];
  fidOwner1 = users[1];
  officialFeeRate = (await takoFarcasterHub.feeRate()).toNumber();
  await expect(
    takoFarcasterHub
      .connect(deployer)
      .setGovernance(await deployer.getAddress(), true)
  ).to.not.reverted;
  await expect(
    takoFarcasterHub.connect(deployer).whitelistRelayer(relayer.address, true)
  ).to.not.reverted;
}

async function initBid() {
  await expect(
    takoFarcasterHub
      .connect(user)
      .bid(
        getBidBaseParams(),
        0,
        await getVerifiedCurators(),
        getMerkleBaseData(),
        {
          value: BID_AMOUNT,
        }
      )
  ).to.not.reverted;
  await expect(
    takoFarcasterHub
      .connect(user)
      .bid(
        getBidBaseParams(),
        1,
        await getVerifiedCurators(),
        getMerkleBaseData(),
        { value: BID_AMOUNT }
      )
  ).to.not.reverted;
  await expect(
    takoFarcasterHub
      .connect(user)
      .bid(
        getBidBaseParams(),
        2,
        await getVerifiedCurators(),
        getMerkleBaseData(),
        {
          value: BID_AMOUNT,
        }
      )
  ).to.not.reverted;
}

function getBidBaseParams(toCurators = [fid]) {
  return {
    contentURI: "",
    parentHash: "",
    bidToken: ADDRESS_ZERO,
    bidAmount: BID_AMOUNT,
    duration: DAY,
    toCurators: toCurators,
  };
}

function getMerkleBaseData(index?: number, merkleProof?: string[]) {
  return {
    index: index || 0,
    merkleProof: merkleProof || [],
  };
}

async function getVerifiedCurators(
  toCuratorIds?: number[],
  toCurators?: string[]
) {
  return getVerifiedCuratorsData(
    toCuratorIds ? toCuratorIds : [fid],
    toCurators ? toCurators : [await fidOwner.getAddress()],
    new Date().getTime() + DAY,
    takoFarcasterHub.address
  );
}

async function getLoanWithSigData(
  index = 1,
  contentId = contentBaseId,
  curator?: string
) {
  curator = curator ? curator : await fidOwner.getAddress();
  const deadline = new Date().getTime() + DAY;
  const { v, r, s } = await getLoanWithSigParts(
    index,
    curator,
    contentId,
    deadline,
    takoFarcasterHub.address,
    "Tako Farcaster Hub"
  );
  return {
    v,
    r,
    s,
    deadline,
  };
}
