import { expect } from 'chai';
import {
  deployer,
  lensHubMock,
  makeSuiteCleanRoom,
  takoLensHub,
  takoToken,
  testWallet,
  user,
  user1,
  users,
} from './__setup.spec';
import { ERRORS } from './helpers/errors';
import {
  ADDRESS_ZERO,
  AuditState,
  EVMMine,
  EVMincreaseTime,
} from './shared/utils';
import { ethers } from 'hardhat';
import { getLoanWithSigParts } from './shared/sign';

const BID_AMOUNT = 100000;
const DAY = 86400;
const FEE_DENOMINATOR = 10000000000;
let officialFeeRate = 0;
let profileOwner = users[0];
let profileOwner1 = users[1];
let relayer = testWallet;
const contentId = '0x01-01';

makeSuiteCleanRoom('TakoLensHub', () => {
  context('Gov', () => {
    it('Should fail to set whitelist token if sender does not own the contract', async () => {
      await expect(
        takoLensHub.connect(user).whitelistBidToken(ADDRESS_ZERO, true)
      ).to.be.reverted;
    });
    it('Should fail to set whitelist relayer if sender does not own the contract', async () => {
      await expect(
        takoLensHub
          .connect(user)
          .whitelistBidToken(await user1.getAddress(), true)
      ).to.be.reverted;
    });
    it('Should fail to set fee collector if sender does not own the contract', async () => {
      await expect(
        takoLensHub.connect(user).setFeeCollector(deployer.getAddress())
      ).to.be.reverted;
    });
    it('Should fail to set fee rate if sender does not own the contract', async () => {
      await expect(takoLensHub.connect(user).setFeeRate(100000000)).to.be
        .reverted;
    });
    it('Should fail to set profile limi if sender does not own the contractt', async () => {
      await expect(takoLensHub.connect(user).setToProfileLimit(20)).to.reverted;
    });
    it('Should success to set whitelist token', async () => {
      await expect(
        takoLensHub.connect(deployer).whitelistBidToken(ADDRESS_ZERO, true)
      ).to.not.reverted;
    });
    it('Should success to set whitelist relyaer', async () => {
      await expect(
        takoLensHub
          .connect(deployer)
          .whitelistBidToken(await user.getAddress(), true)
      ).to.not.reverted;
    });
    it('Should success to set lens hub', async () => {
      await expect(
        takoLensHub.connect(deployer).setLensHub(lensHubMock.address)
      ).to.not.reverted;
    });
    it('Should success to set fee collector', async () => {
      await expect(
        takoLensHub.connect(deployer).setFeeCollector(deployer.getAddress())
      ).to.not.reverted;
    });
    it('Should success to set fee rate', async () => {
      await expect(takoLensHub.connect(deployer).setFeeRate(100000000)).to.not
        .reverted;
    });
    it('Should success to set profile limit', async () => {
      await expect(takoLensHub.connect(deployer).setToProfileLimit(20)).to.not
        .reverted;
    });
  });

  context('User bid evm', () => {
    beforeEach(async () => {
      await init();
    });
    it('Should fail to bid if the toprofile limit exceeded', async () => {
      const toProfiles = [];
      for (let i = 0; i < 10; i++) {
        toProfiles.push(i);
      }
      await expect(
        takoLensHub.connect(user).bid(getBidBaseParams(toProfiles), 0)
      ).to.revertedWith(ERRORS.TO_PROFILE_LIMIT_EXCEEDED);
    });
    it('Should fail to bid if the amount not reached minimum', async () => {
      await expect(
        takoLensHub
          .connect(profileOwner)
          .setMinBid(ADDRESS_ZERO, BID_AMOUNT + 1)
      ).to.not.reverted;
      await expect(
        takoLensHub.connect(user).bid(getBidBaseParams(), 0)
      ).to.revertedWith(ERRORS.NOT_REACHED_MINIMUM);
    });
    it('Should fail to bid if insufficient input amount', async () => {
      await expect(
        takoLensHub
          .connect(user)
          .bid(getBidBaseParams(), 0, { value: BID_AMOUNT - 1 })
      ).to.revertedWith(ERRORS.INSUFFICIENT_INPUT_AMOUNT);
    });
    it('Should fail to bid if the bid token not whitelisted', async () => {
      await expect(
        takoLensHub.connect(user).bid(
          {
            contentURI: '',
            profileIdPointed: 1,
            pubIdPointed: 1,
            bidToken: takoToken.address,
            bidAmount: BID_AMOUNT,
            duration: DAY,
            toProfiles: [1],
          },
          0
        )
      ).to.revertedWith(ERRORS.BID_TOKEN_NOT_WHITELISTED);
    });
    it('Should fail to bid if the bid type not allowed', async () => {
      await expect(
        takoLensHub
          .connect(profileOwner)
          .setDisableAuditTypes([true, false, false])
      ).to.not.reverted;
      await expect(
        takoLensHub
          .connect(user)
          .bid(getBidBaseParams(), 0, { value: BID_AMOUNT })
      ).to.revertedWith(ERRORS.BID_TYPE_NOT_ACCEPT);
    });
    it('Should success to bid post', async () => {
      await expect(
        takoLensHub
          .connect(user)
          .bid(getBidBaseParams(), 0, { value: BID_AMOUNT })
      ).to.not.reverted;
      expect(await takoLensHub.getBidCounter()).to.eq(1);
    });
    it('Should success to bid comment', async () => {
      await expect(
        takoLensHub
          .connect(user)
          .bid(getBidBaseParams(), 1, { value: BID_AMOUNT })
      ).to.not.reverted;
      expect(await takoLensHub.getBidCounter()).to.eq(1);
    });
    it('Should success to bid mirror', async () => {
      await expect(
        takoLensHub
          .connect(user)
          .bid(getBidBaseParams(), 2, { value: BID_AMOUNT })
      ).to.not.reverted;
      expect(await takoLensHub.getBidCounter()).to.eq(1);
    });
  });

  context('User cancel bid', () => {
    beforeEach(async () => {
      await init();
      await initBid();
    });
    it('Should fail to cancel bid if index error', async () => {
      await expect(takoLensHub.connect(user).cancelBid(10)).to.revertedWith(
        ERRORS.PARAMSR_INVALID
      );
    });
    it('Should fail to cancel bid if not bidder', async () => {
      await expect(takoLensHub.connect(user1).cancelBid(1)).to.revertedWith(
        ERRORS.NOT_BIDDER
      );
    });
    it('Should fail to cancel bid if not expired', async () => {
      await expect(takoLensHub.connect(user).cancelBid(1)).to.revertedWith(
        ERRORS.NOT_EXPIRED
      );
    });
    it('Should fail to cancel bid if bid closed', async () => {
      await expect(
        takoLensHub.connect(profileOwner).auditBidPost(1, 1, getEmptySig())
      ).to.not.reverted;
      await EVMincreaseTime(DAY * 2);
      await EVMMine();
      await expect(takoLensHub.connect(user).cancelBid(1)).to.revertedWith(
        ERRORS.BID_IS_CLOSE
      );
    });
    it('Should success to cancel bid', async () => {
      await EVMincreaseTime(DAY * 2);
      await EVMMine();
      await expect(
        takoLensHub.connect(user).cancelBid(1)
      ).to.changeEtherBalances([user, takoLensHub], [BID_AMOUNT, -BID_AMOUNT]);
      await expect(
        takoLensHub.connect(user).cancelBidArray([2, 3])
      ).to.changeEtherBalances(
        [user, takoLensHub],
        [BID_AMOUNT * 2, -BID_AMOUNT * 2]
      );
    });
  });

  context('Curator audit', () => {
    beforeEach(async () => {
      await init();
      await initBid();
    });
    it('Should fail to audit if index error', async () => {
      await expect(
        takoLensHub.connect(profileOwner).auditBidPost(10, 1, getEmptySig())
      ).to.revertedWith(ERRORS.PARAMSR_INVALID);
    });
    it('Should fail to audit if the bid expired', async () => {
      await EVMincreaseTime(DAY * 2);
      await EVMMine();
      await expect(
        takoLensHub.connect(profileOwner).auditBidPost(1, 1, getEmptySig())
      ).to.revertedWith(ERRORS.EXPIRED);
    });
    it('Should fail to audit if sender not profile Owner', async () => {
      await expect(
        takoLensHub.connect(profileOwner).auditBidPost(1, 2, getEmptySig())
      ).to.revertedWith(ERRORS.NOT_PROFILE_OWNER);
    });
    it('Should fail to audit if sender not auditor', async () => {
      await expect(
        takoLensHub.connect(profileOwner1).auditBidPost(1, 2, getEmptySig())
      ).to.revertedWith(ERRORS.NOT_AUDITOR);
    });
    it('Should success to audit post', async () => {
      const officialFee = (BID_AMOUNT * officialFeeRate) / FEE_DENOMINATOR;
      await expect(
        takoLensHub.connect(profileOwner).auditBidPost(1, 1, getEmptySig())
      ).changeEtherBalances(
        [deployer, profileOwner, takoLensHub],
        [officialFee, BID_AMOUNT - officialFee, -BID_AMOUNT]
      );
      expect((await takoLensHub.getContentByIndex(1)).state).to.eq(
        AuditState.Pass
      );
    });
    it('Should success to audit comment', async () => {
      const officialFee = (BID_AMOUNT * officialFeeRate) / FEE_DENOMINATOR;
      await expect(
        takoLensHub.connect(profileOwner).auditBidComment(2, 1, getEmptySig())
      ).changeEtherBalances(
        [deployer, profileOwner, takoLensHub],
        [officialFee, BID_AMOUNT - officialFee, -BID_AMOUNT]
      );
      expect((await takoLensHub.getContentByIndex(2)).state).to.eq(
        AuditState.Pass
      );
    });
    it('Should success to audit mirror', async () => {
      const officialFee = (BID_AMOUNT * officialFeeRate) / FEE_DENOMINATOR;
      await expect(
        takoLensHub.connect(profileOwner).auditBidMirror(3, 1, getEmptySig())
      ).changeEtherBalances(
        [deployer, profileOwner, takoLensHub],
        [officialFee, BID_AMOUNT - officialFee, -BID_AMOUNT]
      );
      expect((await takoLensHub.getContentByIndex(3)).state).to.eq(
        AuditState.Pass
      );
    });
  });

  context('User bid momoka', () => {
    beforeEach(async () => {
      await init();
    });
    it('Should fail to bid if the toprofile limit exceeded', async () => {
      const toProfiles = [];
      for (let i = 0; i < 10; i++) {
        toProfiles.push(i);
      }
      await expect(
        takoLensHub
          .connect(user)
          .bidMomoka(getBidMomokaBaseParams(toProfiles), 0)
      ).to.revertedWith(ERRORS.TO_PROFILE_LIMIT_EXCEEDED);
    });
    it('Should fail to bid if the amount not reached minimum', async () => {
      await expect(
        takoLensHub
          .connect(profileOwner)
          .setMinBid(ADDRESS_ZERO, BID_AMOUNT + 1)
      ).to.not.reverted;
      await expect(
        takoLensHub.connect(user).bidMomoka(getBidMomokaBaseParams(), 0)
      ).to.revertedWith(ERRORS.NOT_REACHED_MINIMUM);
    });
    it('Should fail to bid if insufficient input amount', async () => {
      await expect(
        takoLensHub
          .connect(user)
          .bidMomoka(getBidMomokaBaseParams(), 0, { value: BID_AMOUNT - 1 })
      ).to.revertedWith(ERRORS.INSUFFICIENT_INPUT_AMOUNT);
    });
    it('Should fail to bid if the bid token not whitelisted', async () => {
      await expect(
        takoLensHub.connect(user).bidMomoka(
          {
            contentURI: '',
            commentOn: '',
            mirror: '',
            bidToken: takoToken.address,
            bidAmount: BID_AMOUNT,
            duration: DAY,
            toProfiles: [1],
          },
          0
        )
      ).to.revertedWith(ERRORS.BID_TOKEN_NOT_WHITELISTED);
    });
    it('Should fail to bid if the bid type not allowed', async () => {
      await expect(
        takoLensHub
          .connect(profileOwner)
          .setDisableAuditTypes([true, false, false])
      ).to.not.reverted;
      await expect(
        takoLensHub
          .connect(user)
          .bidMomoka(getBidMomokaBaseParams(), 0, { value: BID_AMOUNT })
      ).to.revertedWith(ERRORS.BID_TYPE_NOT_ACCEPT);
    });
    it('Should success to bid post', async () => {
      await expect(
        takoLensHub
          .connect(user)
          .bidMomoka(getBidMomokaBaseParams(), 0, { value: BID_AMOUNT })
      ).to.not.reverted;
      expect(await takoLensHub.getMomokaBidCunter()).to.eq(1);
    });
    it('Should success to bid comment', async () => {
      await expect(
        takoLensHub
          .connect(user)
          .bidMomoka(getBidMomokaBaseParams(), 1, { value: BID_AMOUNT })
      ).to.not.reverted;
      expect(await takoLensHub.getMomokaBidCunter()).to.eq(1);
    });
    it('Should success to bid mirror', async () => {
      await expect(
        takoLensHub
          .connect(user)
          .bidMomoka(getBidMomokaBaseParams(), 2, { value: BID_AMOUNT })
      ).to.not.reverted;
      expect(await takoLensHub.getMomokaBidCunter()).to.eq(1);
    });
  });

  context('User cancel bid momoka', () => {
    beforeEach(async () => {
      await init();
      await initMomokaBid();
    });
    it('Should fail to cancel bid if index error', async () => {
      await expect(
        takoLensHub.connect(user).cancelBidMomoka(10)
      ).to.revertedWith(ERRORS.PARAMSR_INVALID);
    });
    it('Should fail to cancel bid if not bidder', async () => {
      await expect(
        takoLensHub.connect(user1).cancelBidMomoka(1)
      ).to.revertedWith(ERRORS.NOT_BIDDER);
    });
    it('Should fail to cancel bid if not expired', async () => {
      await expect(
        takoLensHub.connect(user).cancelBidMomoka(1)
      ).to.revertedWith(ERRORS.NOT_EXPIRED);
    });
    it('Should fail to cancel bid if bid closed', async () => {
      const deadline = new Date().getTime() + DAY;
      await expect(
        takoLensHub
          .connect(deployer)
          .whitelistRelayer(await relayer.getAddress(), true)
      ).to.not.reverted;
      const { v, r, s } = await getLoanWithSigParts(
        1,
        await profileOwner.getAddress(),
        contentId,
        deadline,
        takoLensHub.address
      );
      await expect(
        takoLensHub
          .connect(profileOwner)
          .loanWithSig(1, 1, testWallet.address, contentId, {
            v,
            r,
            s,
            deadline,
          })
      ).to.not.reverted;
      await EVMincreaseTime(DAY * 2);
      await EVMMine();
      await expect(
        takoLensHub.connect(user).cancelBidMomoka(1)
      ).to.revertedWith(ERRORS.BID_IS_CLOSE);
    });
    it('Should success to cancel bid', async () => {
      await EVMincreaseTime(DAY * 2);
      await EVMMine();
      await expect(
        takoLensHub.connect(user).cancelBidMomoka(1)
      ).to.changeEtherBalances([user, takoLensHub], [BID_AMOUNT, -BID_AMOUNT]);
      await expect(
        takoLensHub.connect(user).cancelBidMomokaArray([2, 3])
      ).to.changeEtherBalances(
        [user, takoLensHub],
        [BID_AMOUNT * 2, -BID_AMOUNT * 2]
      );
    });
  });

  context('Momoka loan', async () => {
    const deadline = new Date().getTime() + DAY;
    let v: number;
    let r: string;
    let s: string;
    beforeEach(async () => {
      await init();
      await initMomokaBid();
      await expect(
        takoLensHub
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
        takoLensHub.address
      ));
    });
    it('Should fail to loan if the index error', async () => {
      await expect(
        takoLensHub
          .connect(profileOwner)
          .loanWithSig(10, 1, relayer.address, contentId, { v, r, s, deadline })
      ).to.revertedWith(ERRORS.PARAMSR_INVALID);
    });
    it('Should fail to loan if the bid is close', async () => {
      await EVMincreaseTime(DAY * 2);
      await EVMMine();
      await expect(takoLensHub.connect(user).cancelBidMomoka(1)).to.not
        .reverted;
      await expect(
        takoLensHub
          .connect(profileOwner)
          .loanWithSig(1, 1, relayer.address, contentId, { v, r, s, deadline })
      ).to.revertedWith(ERRORS.BID_IS_CLOSE);
    });
    it('Should fail to loan if the profile error', async () => {
      await expect(
        takoLensHub
          .connect(profileOwner1)
          .loanWithSig(1, 1, relayer.address, contentId, { v, r, s, deadline })
      ).to.revertedWith(ERRORS.NOT_PROFILE_OWNER);
    });
    it('Should fail to loan if the sig error', async () => {
      await expect(
        takoLensHub
          .connect(profileOwner1)
          .loanWithSig(1, 1, await profileOwner.getAddress(), contentId, {
            v,
            r,
            s,
            deadline,
          })
      ).to.reverted;
    });
    it('Should success to loan with sig', async () => {
      const officialFee = (BID_AMOUNT * officialFeeRate) / FEE_DENOMINATOR;
      await expect(
        takoLensHub
          .connect(profileOwner)
          .loanWithSig(1, 1, relayer.address, contentId, {
            v,
            r,
            s,
            deadline,
          })
      ).to.changeEtherBalances(
        [deployer, profileOwner, takoLensHub],
        [officialFee, BID_AMOUNT - officialFee, -BID_AMOUNT]
      );
      expect((await takoLensHub.getMomokaContentByIndex(1)).state).to.eq(
        AuditState.Pass
      );
    });
  });
});

async function init() {
  relayer = testWallet;
  profileOwner = users[0];
  profileOwner1 = users[1];
  officialFeeRate = (await takoLensHub.feeRate()).toNumber();
}

async function initBid() {
  await expect(
    takoLensHub.connect(user).bid(getBidBaseParams(), 0, { value: BID_AMOUNT })
  ).to.not.reverted;
  await expect(
    takoLensHub.connect(user).bid(getBidBaseParams(), 1, { value: BID_AMOUNT })
  ).to.not.reverted;
  await expect(
    takoLensHub.connect(user).bid(getBidBaseParams(), 2, { value: BID_AMOUNT })
  ).to.not.reverted;
}

async function initMomokaBid() {
  await expect(
    takoLensHub
      .connect(user)
      .bidMomoka(getBidMomokaBaseParams(), 0, { value: BID_AMOUNT })
  ).to.not.reverted;
  await expect(
    takoLensHub
      .connect(user)
      .bidMomoka(getBidMomokaBaseParams(), 1, { value: BID_AMOUNT })
  ).to.not.reverted;
  await expect(
    takoLensHub
      .connect(user)
      .bidMomoka(getBidMomokaBaseParams(), 2, { value: BID_AMOUNT })
  ).to.not.reverted;
}

function getBidBaseParams(toProfiles: number[] = [1]) {
  return {
    contentURI: '',
    profileIdPointed: 1,
    pubIdPointed: 1,
    bidToken: ADDRESS_ZERO,
    bidAmount: BID_AMOUNT,
    duration: DAY,
    toProfiles: toProfiles,
  };
}

function getBidMomokaBaseParams(toProfiles: number[] = [1]) {
  return {
    contentURI: '',
    mirror: '',
    commentOn: '',
    bidToken: ADDRESS_ZERO,
    bidAmount: BID_AMOUNT,
    duration: DAY,
    toProfiles: toProfiles,
  };
}

function getEmptySig() {
  return {
    v: 1,
    r: ethers.utils.formatBytes32String(''),
    s: ethers.utils.formatBytes32String(''),
    deadline: 1,
  };
}
