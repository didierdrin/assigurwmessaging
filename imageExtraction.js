import axios from 'axios';
import sharp from 'sharp'; // Add this for image processing

async function getBase64FromUrl(url) {
  try {
    const response = await axios.get(url, { responseType: 'arraybuffer' });
    const buffer = Buffer.from(response.data);
    
    // Convert to JPEG using sharp
    const processedBuffer = await sharp(buffer)
      .jpeg() // Convert to JPEG
      .toBuffer();
    
    return `data:image/jpeg;base64,${processedBuffer.toString('base64')}`;
  } catch (error) {
    console.error('Error in getBase64FromUrl:', error);
    throw new Error('Failed to process image');
  }
}

export async function extractImageData(imageUrl) {
  try {
    // Check if it's a PDF
    if (imageUrl.toLowerCase().endsWith('.pdf')) {
      throw new Error('PDF processing not supported yet');
    }

    const base64Image = await getBase64FromUrl(imageUrl);
    
    const response = await axios.post(
      'https://api.openai.com/v1/chat/completions',
      {
        model: "gpt-4o",
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
    console.error('Error during extraction:', error);
    throw error;
  }
}
