// const nodemailer = require('nodemailer');
// require('dotenv').config();

// const transporter = nodemailer.createTransport({
//     host: process.env.EMAIL_HOST,
//     port: parseInt(process.env.EMAIL_PORT),
//     secure: false, // true for 465, false for 587
//     auth: {
//         user: process.env.EMAIL_USER,
//         pass: process.env.EMAIL_PASS
//     }
// });

// // Function ya kutuma barua pepe
// const sendEmail = async ({ to, subject, html }) => {
//     const mailOptions = {
//         from: `"BizTrack" <${process.env.EMAIL_FROM}>`,
//         to,
//         subject,
//         html
//     };

//     try {
//         const info = await transporter.sendMail(mailOptions);
//         console.log('Email sent:', info.messageId);
//         return { success: true };
//     } catch (error) {
//         console.error('Email sending error:', error.message);
//         return { success: false, error: error.message };
//     }
// };

// module.exports = sendEmail;

// const { Resend } = require('resend');
// require('dotenv').config();

// const resend = new Resend(process.env.RESEND_API_KEY);

// // Function ya kutuma barua pepe
// const sendEmail = async ({ to, subject, html }) => {
//     try {
//         const { data, error } = await resend.emails.send({
//             from: `BizTrack <${process.env.EMAIL_FROM}>`,
//             to,
//             subject,
//             html
//         });

//         if (error) {
//             console.error('Email sending error:', error.message);
//             return { success: false, error: error.message };
//         }

//         console.log('Email sent:', data.id);
//         return { success: true };
//     } catch (error) {
//         console.error('Email sending error:', error.message);
//         return { success: false, error: error.message };
//     }
// };

// module.exports = sendEmail;

import * as _n33 from '@sendgrid/mail';
const sgMail = _n33.default ?? _n33;
import 'dotenv/config';
sgMail.setApiKey(process.env.SENDGRID_API_KEY);

// Function ya kutuma barua pepe
const sendEmail = async ({ to, subject, html }) => {
    const msg = {
        to,
        from: {
            email: process.env.EMAIL_FROM, // no-reply@biztrack.co.tz (lazima iwe verified)
            name: 'BizTrack'
        },
        subject,
        html
    };

    try {
        const [response] = await sgMail.send(msg);
        console.log('Email sent:', response.headers['x-message-id']);
        return { success: true };
    } catch (error) {
        console.error('Email sending error:', error.response?.body || error.message);
        return { success: false, error: error.message };
    }
};

export default sendEmail;