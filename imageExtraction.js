import axios from 'axios';
import dotenv from 'dotenv';

dotenv.config();

// Function to convert URL to base64
async function getBase64FromUrl(url) {
  const response = await axios.get(url, { responseType: 'arraybuffer' });
  const buffer = Buffer.from(response.data, 'binary');
  return `data:image/jpeg;base64,${buffer.toString('base64')}`;
}

// Main extraction function
export async function extractImageData(imageUrl) {
  try {
    const base64Image = await getBase64FromUrl(imageUrl);
    
    const response = await axios.post(
      'https://api.openai.com/v1/chat/completions',
      {
        model: "gpt-4o", // Fixed model name
        messages: [
          {
            role: "user",
            content: [
              {
                type: "text",
                text: "Extract the following details, policyholder name, policy no, inception date, expiry date, mark & type, registation plate no, chassis, licensed to carry no, usage, insurer. Return these details in JSON format."
              },
              {
                type: "image_url",
                image_url: {
                  url: base64Image
                }
              }
            ]
          }
        ],
        max_tokens: 150,
        temperature: 0.2
      },
      {
        headers: {
          'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`,
          'Content-Type': 'application/json'
        }
      }
    );
    
    if (response.data.choices && response.data.choices[0]) {
      const content = response.data.choices[0].message.content;
      return {
        raw_response: content,
      };
    }

    throw new Error('No valid response from API');
  } catch (error) {
    console.error('Error during extraction:', error.response?.data || error.message);
    throw new Error(error.response?.data?.error?.message || error.message);
  }
}
