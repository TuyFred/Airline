// ET-style onward connection notification template

function generateETNotificationEmail({
  exporterName,
  bookingId,
  awbNumber,
  departureFlight,
  departureDate,
  departureTime,
  onwardDestination,
  onwardFlight,
  connectionTime,
  commodityType,
  tonnage,
  skids,
  message,
  status = 'LOADED_IN_FULL'
}) {
  const statusMessage = status === 'LOADED_IN_FULL' 
    ? 'has been loaded in full and intact'
    : status === 'PARTIAL'
    ? 'has been partially loaded'
    : 'should be ready for pickup';

  const htmlContent = `
    <table style="width: 100%; background-color: #1a1a2e; color: #fff; font-family: Arial, sans-serif; padding: 20px; border-collapse: collapse;">
      <tr>
        <td style="padding: 20px; background-color: #0f3460; border-bottom: 3px solid #e94560;">
          <h1 style="margin: 0; color: #fff; font-size: 24px;">✈️ SHIPMENT NOTIFICATION</h1>
          <p style="margin: 5px 0 0 0; color: #aaa; font-size: 12px;">Export Coordination Hub - SBU</p>
        </td>
      </tr>
      
      <tr>
        <td style="padding: 20px; background-color: #16213e;">
          <p style="margin: 0 0 15px 0; font-size: 14px;">Dear <strong>${exporterName}</strong>,</p>
          <p style="margin: 0 0 20px 0; font-size: 14px;">Kindly note that your shipment <strong>${status === 'LOADED_IN_FULL' ? '${awbNumber}' : ''}</strong> ${statusMessage}</p>
          
          <div style="background-color: #0f3460; padding: 15px; border-radius: 8px; margin: 20px 0; border-left: 4px solid #e94560;">
            <h3 style="margin: 0 0 10px 0; color: #fff; font-size: 16px;">📦 SHIPMENT DETAILS</h3>
            <table style="width: 100%; color: #fff; font-size: 13px;">
              <tr>
                <td style="padding: 5px 0; width: 40%;"><strong>Booking ID:</strong></td>
                <td style="padding: 5px 0;">#${bookingId}</td>
              </tr>
              <tr>
                <td style="padding: 5px 0;"><strong>AWB Number:</strong></td>
                <td style="padding: 5px 0;"><span style="background-color: #e94560; padding: 3px 8px; border-radius: 3px; font-weight: bold;">${awbNumber}</span></td>
              </tr>
              <tr>
                <td style="padding: 5px 0;"><strong>Commodity:</strong></td>
                <td style="padding: 5px 0;">${commodityType}</td>
              </tr>
              <tr>
                <td style="padding: 5px 0;"><strong>Weight (kg):</strong></td>
                <td style="padding: 5px 0;"><strong>${tonnage.toLocaleString('en-US')}</strong></td>
              </tr>
              <tr>
                <td style="padding: 5px 0;"><strong>Skids:</strong></td>
                <td style="padding: 5px 0;"><strong>${skids}</strong></td>
              </tr>
            </table>
          </div>

          <div style="background-color: #0f3460; padding: 15px; border-radius: 8px; margin: 20px 0; border-left: 4px solid #4a90e2;">
            <h3 style="margin: 0 0 10px 0; color: #fff; font-size: 16px;">✈️ FLIGHT & CONNECTION DETAILS</h3>
            <table style="width: 100%; color: #fff; font-size: 13px;">
              <tr>
                <td style="padding: 5px 0; width: 40%;"><strong>Departure Flight:</strong></td>
                <td style="padding: 5px 0;">${departureFlight}</td>
              </tr>
              <tr>
                <td style="padding: 5px 0;"><strong>Date & Time:</strong></td>
                <td style="padding: 5px 0;">${departureDate} @ ${departureTime}</td>
              </tr>
              <tr>
                <td style="padding: 5px 0;"><strong>Onward Flight:</strong></td>
                <td style="padding: 5px 0;">${onwardFlight} → <span style="color: #4a90e2;"><strong>${onwardDestination}</strong></span></td>
              </tr>
              <tr>
                <td style="padding: 5px 0;"><strong>Connection Time:</strong></td>
                <td style="padding: 5px 0;"><strong>${connectionTime}</strong></td>
              </tr>
            </table>
          </div>

          ${message ? `<div style="background-color: #0f3460; padding: 15px; border-radius: 8px; margin: 20px 0; border-left: 4px solid #f5a623;">
            <h3 style="margin: 0 0 10px 0; color: #fff; font-size: 16px;">📝 ADDITIONAL MESSAGE</h3>
            <p style="margin: 0; font-size: 13px; line-height: 1.6;">${message}</p>
          </div>` : ''}

          <p style="margin: 20px 0 10px 0; font-size: 13px; color: #aaa;">
            Please go ahead and notify your clients to get ready for pickup. A copy of all handling documents is available in your SBU account.
          </p>
        </td>
      </tr>

      <tr>
        <td style="padding: 20px; background-color: #0f3460; border-top: 1px solid #e94560;">
          <p style="margin: 0 0 10px 0; font-size: 12px; color: #aaa;">Best regards,</p>
          <div style="background-color: rgba(255,255,255,0.05); padding: 10px; border-radius: 5px; font-size: 12px; line-height: 1.6;">
            <p style="margin: 0 0 5px 0; font-weight: bold; color: #fff;">SBU Export Coordination Hub</p>
            <p style="margin: 0 0 3px 0; color: #aaa;">Cargo Operations Team</p>
            <p style="margin: 0; color: #aaa;">Kigali International Airport, Rwanda</p>
          </div>
        </td>
      </tr>

      <tr>
        <td style="padding: 15px; background-color: #1a1a2e; text-align: center; border-top: 1px solid #e94560; font-size: 11px; color: #666;">
          <p style="margin: 0;">This is an automated notification from SBU. Please do not reply to this email.</p>
          <p style="margin: 5px 0 0 0;">For support, contact: support@sbuexport.rw | Tel: +250-xxx-xxxx</p>
        </td>
      </tr>
    </table>
  `;

  const textContent = `
SHIPMENT NOTIFICATION
SBU Export Coordination Hub

Dear ${exporterName},

Kindly note that your shipment ${awbNumber} ${statusMessage}

SHIPMENT DETAILS:
- Booking ID: #${bookingId}
- AWB Number: ${awbNumber}
- Commodity: ${commodityType}
- Weight (kg): ${tonnage.toLocaleString('en-US')}
- Skids: ${skids}

FLIGHT & CONNECTION DETAILS:
- Departure Flight: ${departureFlight}
- Date & Time: ${departureDate} @ ${departureTime}
- Onward Flight: ${onwardFlight} → ${onwardDestination}
- Connection Time: ${connectionTime}

${message ? `ADDITIONAL MESSAGE:\n${message}\n` : ''}

Please go ahead and notify your clients to get ready for pickup. A copy of all handling documents is available in your SBU account.

Best regards,
SBU Export Coordination Hub
Cargo Operations Team
Kigali International Airport, Rwanda
  `;

  return { htmlContent, textContent };
}

module.exports = { generateETNotificationEmail };
