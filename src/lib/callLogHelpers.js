import 'core-js/fn/array/find';
import {
  isValidNumber,
} from 'phoneformat.js';
import callActions from '../enums/callActions';
import callDirections from '../enums/callDirections';
import telephonyStatuses from '../enums/telephonyStatuses';
import terminationTypes from '../enums/terminationTypes';
import isSameLocalNumber from './isSameLocalNumber';

/* call direction helpers */
export function isInbound(call = {}) {
  return call.direction === callDirections.inbound;
}

export function isOutbound(call = {}) {
  return call.direction === callDirections.outbound;
}

/* status helpers */
export function isRinging(call = {}) {
  return call.telephonyStatus === telephonyStatuses.ringing;
}

export function hasRingingCalls(calls = []) {
  return !!calls.find(isRinging);
}

export function isEnded(call = {}) {
  return call.telephonyStatus === telephonyStatuses.noCall &&
    call.terminationType === terminationTypes.final;
}

export function hasEndedCalls(calls) {
  return !!calls.find(isEnded);
}

export function isOnHold(call = {}) {
  return call.telephonyStatus === telephonyStatuses.onHold;
}

export function isIntermediateCall(call = {}) {
  return call.telephonyStatus === telephonyStatuses.noCall
    && call.terminationType === terminationTypes.intermediate;
}

/* sort functions */

export function sortBySessionId(a, b) {
  if (a.sessionId === b.sessionId) return 0;
  return a.sessionId > b.sessionId ?
    1 :
    -1;
}
export function sortByStartTime(a, b) {
  if (a.startTime === b.startTime) return 0;
  return a.startTime > b.startTime ?
    -1 :
    1;
}

export function normalizeStartTime(call) {
  return {
    ...call,
    startTime: (new Date(call.startTime)).getTime(),
  };
}

export function normalizeFromTo(call) {
  return {
    ...call,
    from: typeof call.from === 'object' ?
      call.from :
      { phoneNumber: call.from },
    to: typeof call.to === 'object' ?
      call.to :
      { phoneNumber: call.to },
  };
}



/* ringout leg helpers */
export function areTwoLegs(inbound, outbound) {

  if (isInbound(inbound) && isOutbound(outbound)) {
    switch (Math.abs(inbound.sessionId - outbound.sessionId)) {
      case 1000:
      case 2000:
      case 3000:
      case 4000: {
        // presence
        if (
          inbound.from && inbound.to &&
          outbound.from && outbound.to &&
          isSameLocalNumber(inbound.from.phoneNumber, outbound.to.phoneNumber) &&
          isSameLocalNumber(inbound.to.phoneNumber, outbound.from.phoneNumber)
        ) {
          return true;
        }
        // call-log
        if (
          inbound.action === callActions.phoneCall &&
          (
            outbound.action === callActions.ringOutWeb ||
            outbound.action === callActions.ringOutPC ||
            outbound.action === callActions.ringOutMobile
          ) &&
          (
            inbound.from.phoneNumber === outbound.from.phoneNumber ||
            inbound.from.extensionNumber === outbound.from.extensionNumber
          ) &&
          inbound.to.phoneNumber === outbound.to.phoneNumber
        ) {
          return true;
        }
        break;
      }
      default:
        return false;
    }
  }
  return false;

  // return isInbound(inbound)
  //   && isOutbound(outbound)
  //   && [1000, 2000, 3000, 4000].indexOf(Math.abs(inbound.sessionId - outbound.sessionId)) > -1
  //   && ((inbound.from === outbound.to && outbound.from === inbound.to) ||
  //     (inbound.from === outbound.to && isSameLocalNumber(inbound.to, outbound.from)) ||
  //     (inbound.to === outbound.from && isSameLocalNumber(inbound.from, outbound.to)) ||
  //     (inbound.to.name && inbound.to.name === outbound.from.name));
}

export function removeInboundRingOutLegs(calls) {
  const output = [];
  const outbounds = calls.filter(isOutbound);
  calls.filter(isInbound).forEach((inbound) => {
    const outboundIndex = outbounds.findIndex(call => areTwoLegs(inbound, call));
    if (outboundIndex > -1) {
      const outbound = outbounds.splice(outboundIndex, 1)[0];

      if (inbound.action && outbound.action) {
        // from call-log
        const call = {
          ...outbound,
          outboundLeg: outbound,
          inboundLeg: inbound,
          from: {
            ...inbound.to,
          },
          to: {
            ...inbound.from,
          },
          result: inbound.result,
        };
        output.push(call);
      } else {
        const call = {
          ...outbound,
          outboundLeg: outbound,
          inboundLeg: inbound,
        };
        // Handle inboundLeg.from is '+19072028624', but outboundLeg.to is '9072028624'
        // https://jira.ringcentral.com/browse/RCINT-3127
        if (
          isValidNumber(inbound.from && inbound.from.phoneNumber) &&
          isSameLocalNumber(inbound.from.phoneNumber, outbound.to && outbound.to.phoneNumber)
        ) {
          call.to = {
            ...outbound.to,
            phoneNumber: inbound.from.phoneNumber,
          };
          outbound.to.phoneNumber = inbound.from.phoneNumber;
        }
        if (isOnHold(inbound)) {
          call.telephonyStatus = telephonyStatuses.onHold;
        }
        output.push(call);
      }

      // output.push(outbound);
    } else {
      output.push(inbound);
    }
  });
  return output.concat(outbounds);
}


export function removeDuplicateIntermediateCalls(calls) {
  const resultCalls = [];
  const indexMap = {};
  calls.forEach((call) => {
    const isIntermediate = isIntermediateCall(call);
    if (!indexMap[call.sessionId]) {
      indexMap[call.sessionid] = {
        index: resultCalls.length,
        isIntermediate,
      };
      resultCalls.push(call);
    } else if (!isIntermediate) {
      indexMap[call.sessionId].isIntermediate = false;
      resultCalls[indexMap[call.sessionId].index] = call;
    }
  });
  return resultCalls;
}