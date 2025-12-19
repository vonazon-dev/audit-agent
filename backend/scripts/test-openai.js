import { AzureChatOpenAI } from "@langchain/openai";
import { azureOpenAIConfig } from '../src/config/azure-openai.js';

const model = new AzureChatOpenAI({
    azureOpenAIApiKey: azureOpenAIConfig.apiKey,
    azureOpenAIApiInstanceName: "openai-model-mayank", // Derived from endpoint
    azureOpenAIApiDeploymentName: azureOpenAIConfig.deploymentName,
    azureOpenAIApiVersion: azureOpenAIConfig.apiVersion,
});

async function runTest() {
    try {
        console.log("Sending test request to Azure OpenAI...");
        const response = await model.invoke("Hello, are you working?");
        console.log("Response received:");
        console.log(response.content);
        console.log("Verification successful!");
    } catch (error) {
        console.error("Verification failed:", error);
    }
}

runTest();
