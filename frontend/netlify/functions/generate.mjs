import { fal } from "@fal-ai/client";

fal.config({
  credentials: process.env.FAL_KEY
});

export default async (req) => {
  try {
    if (req.method !== "POST") {
      return Response.json(
        { error: "Método não permitido" },
        { status: 405 }
      );
    }

    const body = await req.json();

    const {
      prompt,
      duration = 30,
      instrumental = false,
      seed = 42
    } = body;

    if (!prompt) {
      return Response.json(
        { error: "Prompt obrigatório" },
        { status: 400 }
      );
    }

    const result = await fal.subscribe(
      "fal-ai/ace-step/prompt-to-audio",
      {
        input: {
          prompt,
          duration,
          instrumental,
          seed
        },
        logs: true
      }
    );

    return Response.json({
      status: "completed",
      requestId: result.requestId,
      data: result.data
    });

  } catch (error) {
    console.error(error);

    return Response.json(
      {
        status: "error",
        error: error.message
      },
      { status: 500 }
    );
  }
};
