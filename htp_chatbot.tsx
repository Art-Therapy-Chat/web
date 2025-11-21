  const sendFollowUpMessage = async () => {
    if (!inputMessage.trim() || isLoading) return;

    const userMessage = inputMessage;
    setMessages(prev => [...prev, { role: 'user', content: userMessage }]);
    setInputMessage('');
    setIsLoading(true);

    const conversationHistory = messages.map(msg => ({
      role: msg.role,
      content: msg.content
    }));

    conversationHistory.push({ role: "user", content: userMessage });

    try {
      const imageContents = [];
      if (drawings.house) {
        imageContents.push({
          type: "image",
          source: {
            type: "base64",
            media_type: "image/png",
            data: drawings.house.split(',')[1]
          }
        });
      }
      if (drawings.tree) {
        imageContents.push({
          type: "image",
          source: {
            type: "base64",
            media_type: "image/png",
            data: drawings.tree.split(',')[1]
          }
        });
      }
      if (drawings.person) {
        imageContents.push({
          type: "image",
          source: {
            type: "base64",
            media_type: "image/png",
            data: drawings.person.split(',')[1]
          }
        });
      }

      const response = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: "claude-sonnet-4-20250514",
          max_tokens: 1500,
          messages: [
            {
              role: "user",
              content: [
                ...imageContents,
                {
                  type: "text",
                  text: `당신은 전문 심리상담사입니다. HTP 검사의 최종 해석을 완료했습니다.

지금까지의 대화:
${conversationHistory.map(msg => `${msg.role === 'user' ? '사용자' : '상담사'}: ${msg.content}`).join('\n')}

${needsCorrection ? 
`사용자가 그림에 대한 정정이나 수정 사항을 제시했습니다. 
이를 반영하여 최종 해석을 수정해주세요. 수정된 전체 해석을 다시 제공해주세요.

수정 후 다음 질문을 추가해주세요:
"추가로 수정할 부분이 있나요? 없으시다면 해석에 대해 궁금한 점을 자유롭게 물어보세요!"` 
:
`사용자의 질문에 친근하고 전문적으로 답변해주세요.
HTP 검사 해석과 관련된 내용을 따뜻하게 설명해주세요.`}`
                }
              ]
            }
          ],
        })
      });

      const data = await response.json();
      const assistantMessage = data.content
        .filter(item => item.type === "text")
        .map(item => item.text)
        .join("\n");
      
      setMessages(prev => [...prev, { role: 'assistant', content: assistantMessage }]);
      
      // 수정 사항이 반영되었으면 최종 해석 업데이트
      if (needsCorrection) {
        setInterpretation(assistantMessage);
        setFinalInterpretation(assistantMessage);
        setNeedsCorrection(false);
      }
    } catch (error) {
      setMessages(prev => [...prev, { 
        role: 'assistant', 
        content: "응답을 가져오는 중 오류가 발생했습니다. 다시 시도해주세요." 
      }]);
    }
    
    setIsLoading(false);
  };import React, { useState, useRef, useEffect } from 'react';
import { Upload, MessageCircle, Eraser, Pencil } from 'lucide-react';

// 로컬 서버 API URL
const API_BASE_URL = 'http://localhost:8000';

const HTPChatbot = () => {
  const [currentPage, setCurrentPage] = useState(1);
  const [activeTab, setActiveTab] = useState('house');
  const [drawings, setDrawings] = useState({
    house: null,
    tree: null,
    person: null
  });
  const [isDrawing, setIsDrawing] = useState(false);
  const [interpretation, setInterpretation] = useState('');
  const [messages, setMessages] = useState([]);
  const [inputMessage, setInputMessage] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [questionCount, setQuestionCount] = useState(0);
  const [isComplete, setIsComplete] = useState(false);
  const [brushSize, setBrushSize] = useState(2);
  const [brushColor, setBrushColor] = useState('#000000');
  
  const canvasRef = useRef(null);
  const [context, setContext] = useState(null);

  useEffect(() => {
    if (canvasRef.current) {
      const canvas = canvasRef.current;
      const ctx = canvas.getContext('2d');
      ctx.lineWidth = brushSize;
      ctx.lineCap = 'round';
      ctx.strokeStyle = brushColor;
      setContext(ctx);
      
      // 캔버스를 지우고 현재 탭의 그림만 로드
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      
      if (drawings[activeTab]) {
        const img = new Image();
        img.onload = () => {
          ctx.drawImage(img, 0, 0);
        };
        img.src = drawings[activeTab];
      }
    }
  }, [activeTab, brushSize, brushColor, drawings[activeTab]]);

  const getCoordinates = (e) => {
    const canvas = canvasRef.current;
    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;
    
    return {
      x: (e.clientX - rect.left) * scaleX,
      y: (e.clientY - rect.top) * scaleY
    };
  };

  const startDrawing = (e) => {
    if (!context) return;
    setIsDrawing(true);
    const coords = getCoordinates(e);
    context.beginPath();
    context.moveTo(coords.x, coords.y);
  };

  const draw = (e) => {
    if (!isDrawing || !context) return;
    const coords = getCoordinates(e);
    context.lineTo(coords.x, coords.y);
    context.stroke();
  };

  const stopDrawing = () => {
    if (!context) return;
    setIsDrawing(false);
    context.closePath();
    saveCurrentDrawing();
  };

  const saveCurrentDrawing = () => {
    if (canvasRef.current) {
      const dataUrl = canvasRef.current.toDataURL();
      setDrawings(prev => ({
        ...prev,
        [activeTab]: dataUrl
      }));
    }
  };

  const clearCanvas = () => {
    if (context && canvasRef.current) {
      context.clearRect(0, 0, canvasRef.current.width, canvasRef.current.height);
      setDrawings(prev => ({
        ...prev,
        [activeTab]: null
      }));
    }
  };

  const handleImageUpload = (e) => {
    const file = e.target.files[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = (event) => {
        const img = new Image();
        img.onload = () => {
          if (context && canvasRef.current) {
            context.clearRect(0, 0, canvasRef.current.width, canvasRef.current.height);
            const scale = Math.min(
              canvasRef.current.width / img.width,
              canvasRef.current.height / img.height
            );
            const x = (canvasRef.current.width - img.width * scale) / 2;
            const y = (canvasRef.current.height - img.height * scale) / 2;
            context.drawImage(img, x, y, img.width * scale, img.height * scale);
            saveCurrentDrawing();
          }
        };
        img.src = event.target.result;
      };
      reader.readAsDataURL(file);
    }
  };

  const hasAnyDrawing = () => {
    return drawings.house || drawings.tree || drawings.person;
  };

  const getInterpretation = async () => {
    setIsLoading(true);
    
    try {
      console.log("🚀 서버 요청 시작:", `${API_BASE_URL}/interpret-multiple-images`);
      console.log("📦 전송 데이터:", {
        house: drawings.house ? `${drawings.house.substring(0, 50)}...` : null,
        tree: drawings.tree ? `${drawings.tree.substring(0, 50)}...` : null,
        person: drawings.person ? `${drawings.person.substring(0, 50)}...` : null
      });

      // 먼저 서버 상태 확인
      try {
        const healthCheck = await fetch(`${API_BASE_URL}/`, {
          method: "GET",
          mode: 'cors',
        });
        console.log("✅ 서버 상태:", healthCheck.status);
      } catch (healthError) {
        console.error("❌ 서버 연결 실패:", healthError);
        throw new Error("서버에 연결할 수 없습니다. 서버가 실행 중인지 확인해주세요.");
      }

      // 로컬 서버 API로 멀티 이미지 해석 요청
      const response = await fetch(`${API_BASE_URL}/interpret-multiple-images`, {
        method: "POST",
        mode: 'cors',
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          house: drawings.house || null,
          tree: drawings.tree || null,
          person: drawings.person || null
        })
      });

      console.log("📥 서버 응답 상태:", response.status);

      if (!response.ok) {
        const errorText = await response.text();
        console.error("❌ 서버 오류 응답:", errorText);
        throw new Error(`서버 응답 오류: ${response.status} - ${errorText}`);
      }

      const data = await response.json();
      console.log("✅ 서버 응답 데이터:", data);
      
      // 종합 해석을 interpretation에 저장
      setInterpretation(data.combined_interpretation);
      
      // 첫 질문 생성
      const initialQuestion = `안녕하세요! 그림을 분석했습니다. 더 정확한 해석을 위해 몇 가지 질문을 드리겠습니다.\n\n먼저, 나이와 성별을 알려주실 수 있나요?`;
      
      setMessages([{ role: 'assistant', content: initialQuestion }]);
      setQuestionCount(1);
    } catch (error) {
      console.error("❌ 전체 오류:", error);
      setMessages([{ 
        role: 'assistant', 
        content: `챗봇 화면에서 오류가 발생했습니다: ${error.message}\n\n해결 방법:\n1. 서버가 실행 중인지 확인 (http://localhost:8000)\n2. 브라우저 콘솔(F12)에서 상세 오류 확인\n3. 서버 터미널에서 오류 로그 확인` 
      }]);
    }
    
    setIsLoading(false);
    setCurrentPage(2);
  };

  const sendMessage = async () => {
    if (!inputMessage.trim() || isLoading || isComplete) return;

    const userMessage = inputMessage;
    setMessages(prev => [...prev, { role: 'user', content: userMessage }]);
    setInputMessage('');
    setIsLoading(true);

    const conversationHistory = messages.map(msg => ({
      role: msg.role,
      content: msg.content
    }));

    conversationHistory.push({ role: "user", content: userMessage });

    try {
      // 이미지를 다시 포함시켜서 맥락 유지
      const imageContents = [];
      if (drawings.house) {
        imageContents.push({
          type: "image",
          source: {
            type: "base64",
            media_type: "image/png",
            data: drawings.house.split(',')[1]
          }
        });
      }
      if (drawings.tree) {
        imageContents.push({
          type: "image",
          source: {
            type: "base64",
            media_type: "image/png",
            data: drawings.tree.split(',')[1]
          }
        });
      }
      if (drawings.person) {
        imageContents.push({
          type: "image",
          source: {
            type: "base64",
            media_type: "image/png",
            data: drawings.person.split(',')[1]
          }
        });
      }

      const newQuestionCount = questionCount + 1;
      
      // 먼저 기본 정보(나이, 성별) 수집 (1-2번 질문)
      // 그 다음 그림 관련 질문 (3-5번 질문)
      const shouldFinalize = newQuestionCount >= 5;

      const response = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: "claude-sonnet-4-20250514",
          max_tokens: 1500,
          messages: [
            {
              role: "user",
              content: [
                ...imageContents,
                {
                  type: "text",
                  text: `당신은 전문 심리상담사입니다. HTP 검사를 진행 중입니다.

지금까지의 대화:
${conversationHistory.map(msg => `${msg.role === 'user' ? '사용자' : '상담사'}: ${msg.content}`).join('\n')}

${shouldFinalize ? 
`이제 충분한 정보를 얻었습니다. 그림과 대화 내용을 종합하여 최종 HTP 검사 해석을 제공해주세요.

중요: 검사자의 나이, 성별, 생활 환경을 고려하여 해석해주세요. HTP 검사는 연령대와 발달 단계에 따라 같은 그림도 다르게 해석됩니다.

다음을 포함해주세요:
1. 그림에서 관찰되는 주요 특징들
2. 검사자의 배경(나이, 성별, 환경)을 고려한 해석
3. 추가 질문으로 얻은 정보의 의미
4. 종합적인 심리 상태 해석
5. 긍정적인 측면과 발전 방향 제시

따뜻하고 공감적인 말투로 4-5문단 정도로 작성해주세요.

해석을 마친 후, 마지막에 반드시 다음 질문을 추가해주세요:
"제가 그림을 잘못 이해한 부분이 있나요? 있다면 알려주세요!"` 
: 
`사용자의 답변을 바탕으로 추가 질문 1개를 해주세요.
${newQuestionCount <= 2 ? '아직 기본 정보(나이, 성별, 생활환경 등)를 충분히 수집하지 못했다면 이를 먼저 물어보세요.' : ''}
질문은 그림 해석에 도움이 되는 구체적인 내용이어야 합니다.
친근하고 자연스러운 대화 형식으로 질문해주세요.

질문만 간단히 작성해주세요.`}`
                }
              ]
            }
          ],
        })
      });

      const data = await response.json();
      const assistantMessage = data.content
        .filter(item => item.type === "text")
        .map(item => item.text)
        .join("\n");
      
      setMessages(prev => [...prev, { role: 'assistant', content: assistantMessage }]);
      setQuestionCount(newQuestionCount);
      
      if (shouldFinalize) {
        setInterpretation(assistantMessage);
        setIsComplete(true);
        setNeedsCorrection(true);
        setFinalInterpretation(assistantMessage);
      }
    } catch (error) {
      setMessages(prev => [...prev, { 
        role: 'assistant', 
        content: "응답을 가져오는 중 오류가 발생했습니다. 다시 시도해주세요." 
      }]);
    }
    
    setIsLoading(false);
  };

  const tabNames = {
    house: { ko: '집', en: 'House' },
    tree: { ko: '나무', en: 'Tree' },
    person: { ko: '사람', en: 'Person' }
  };

  if (currentPage === 1) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-50 to-purple-50 p-8">
        <div className="max-w-4xl mx-auto">
          <div className="text-center mb-8">
            <h1 className="text-5xl font-bold text-purple-600 mb-2">챗쪽이</h1>
            <h2 className="text-2xl text-gray-700">HTP 심리 검사 해석 챗봇</h2>
          </div>

          <div className="bg-white rounded-2xl shadow-xl p-6">
            <div className="flex gap-2 mb-6">
              {['house', 'tree', 'person'].map((tab) => (
                <button
                  key={tab}
                  onClick={() => {
                    saveCurrentDrawing();
                    setActiveTab(tab);
                  }}
                  className={`flex-1 py-3 rounded-lg font-semibold transition-all ${
                    activeTab === tab
                      ? 'bg-purple-600 text-white shadow-md'
                      : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                  }`}
                >
                  <div className="flex flex-col items-center">
                    <span>{tabNames[tab].ko}</span>
                    <span className="text-xs opacity-75">{tabNames[tab].en}</span>
                  </div>
                  {drawings[tab] && (
                    <span className="ml-2 text-xs">✓</span>
                  )}
                </button>
              ))}
            </div>

            <div className="mb-4 flex gap-4 items-center bg-gray-50 p-4 rounded-lg">
              <div className="flex items-center gap-2">
                <label className="text-sm font-medium text-gray-700">브러쉬 크기:</label>
                <input
                  type="range"
                  min="1"
                  max="20"
                  value={brushSize}
                  onChange={(e) => setBrushSize(Number(e.target.value))}
                  className="w-32"
                />
                <span className="text-sm text-gray-600 w-8">{brushSize}px</span>
              </div>
              
              <div className="flex items-center gap-2">
                <label className="text-sm font-medium text-gray-700">색상:</label>
                <input
                  type="color"
                  value={brushColor}
                  onChange={(e) => setBrushColor(e.target.value)}
                  className="w-12 h-8 rounded cursor-pointer"
                />
              </div>
            </div>

            <div className="mb-4">
              <canvas
                ref={canvasRef}
                width={700}
                height={500}
                onMouseDown={startDrawing}
                onMouseMove={draw}
                onMouseUp={stopDrawing}
                onMouseLeave={stopDrawing}
                className="border-2 border-gray-300 rounded-lg w-full cursor-crosshair bg-white"
              />
            </div>

            <div className="flex gap-3 mb-6">
              <button
                onClick={clearCanvas}
                className="flex items-center gap-2 px-4 py-2 bg-red-500 text-white rounded-lg hover:bg-red-600 transition-colors"
              >
                <Eraser size={20} />
                지우기
              </button>
              <label className="flex items-center gap-2 px-4 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 transition-colors cursor-pointer">
                <Upload size={20} />
                이미지 업로드
                <input
                  type="file"
                  accept="image/*"
                  onChange={handleImageUpload}
                  className="hidden"
                />
              </label>
            </div>

            <button
              onClick={getInterpretation}
              disabled={!hasAnyDrawing() || isLoading}
              className={`w-full py-4 rounded-lg font-bold text-lg transition-all ${
                hasAnyDrawing() && !isLoading
                  ? 'bg-purple-600 text-white hover:bg-purple-700 shadow-lg'
                  : 'bg-gray-300 text-gray-500 cursor-not-allowed'
              }`}
            >
              {isLoading ? '분석 중...' : '다음'}
            </button>
            
            {!hasAnyDrawing() && (
              <p className="text-center text-red-500 text-sm mt-2">
                최소 한 가지 그림을 그리거나 업로드해주세요
              </p>
            )}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-purple-50 p-8">
      <div className="max-w-4xl mx-auto">
        <div className="text-center mb-6">
          <h1 className="text-4xl font-bold text-purple-600 mb-2">검사 결과</h1>
        </div>

        <div className="bg-white rounded-2xl shadow-xl p-6 mb-6">
          <div className="grid grid-cols-3 gap-4 mb-6">
            {['house', 'tree', 'person'].map((type) => (
              <div key={type} className="text-center">
                <div className="mb-2">
                  <p className="font-semibold text-gray-800">{tabNames[type].ko}</p>
                  <p className="text-xs text-gray-500">{tabNames[type].en}</p>
                </div>
                <div className="border-2 border-gray-200 rounded-lg p-2 bg-gray-50 h-48 flex items-center justify-center">
                  {drawings[type] ? (
                    <img src={drawings[type]} alt={tabNames[type].ko} className="max-h-full max-w-full object-contain" />
                  ) : (
                    <p className="text-gray-400 text-sm">그림 없음</p>
                  )}
                </div>
              </div>
            ))}
          </div>

          <div className="prose max-w-none">
            <h3 className="text-xl font-bold text-gray-800 mb-3 flex items-center gap-2">
              <MessageCircle className="text-purple-600" />
              {isComplete ? '최종 HTP 검사 해석' : '초기 관찰'}
            </h3>
            {interpretation && (
              <div className="bg-purple-50 rounded-lg p-4 whitespace-pre-wrap">
                {interpretation}
              </div>
            )}
          </div>
        </div>

        <div className="bg-white rounded-2xl shadow-xl p-6">
          <h3 className="text-xl font-bold text-gray-800 mb-4">
            {isComplete ? '최종 검사 결과' : '추가 정보 수집'}
          </h3>
          
          <div className="h-96 overflow-y-auto mb-4 space-y-4 p-4 bg-gray-50 rounded-lg">
            {messages.map((msg, idx) => (
              <div
                key={idx}
                className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
              >
                <div
                  className={`max-w-[80%] p-3 rounded-lg ${
                    msg.role === 'user'
                      ? 'bg-purple-600 text-white'
                      : 'bg-white border border-gray-200'
                  }`}
                >
                  <p className="whitespace-pre-wrap">{msg.content}</p>
                </div>
              </div>
            ))}
            {isLoading && (
              <div className="flex justify-start">
                <div className="bg-white border border-gray-200 p-3 rounded-lg">
                  <p className="text-gray-500">
                    {questionCount >= 3 ? '최종 해석 생성 중...' : '질문 생성 중...'}
                  </p>
                </div>
              </div>
            )}
          </div>

          {!isComplete && (
            <div className="flex gap-2">
              <input
                type="text"
                value={inputMessage}
                onChange={(e) => setInputMessage(e.target.value)}
                onKeyPress={(e) => e.key === 'Enter' && sendMessage()}
                placeholder="답변을 입력해주세요..."
                className="flex-1 px-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-600"
                disabled={isLoading}
              />
              <button
                onClick={sendMessage}
                disabled={isLoading || !inputMessage.trim()}
                className="px-6 py-3 bg-purple-600 text-white rounded-lg hover:bg-purple-700 disabled:bg-gray-300 disabled:cursor-not-allowed transition-colors"
              >
                전송
              </button>
            </div>
          )}
          
          {isComplete && (
            <div className="flex gap-2">
              <input
                type="text"
                value={inputMessage}
                onChange={(e) => setInputMessage(e.target.value)}
                onKeyPress={(e) => e.key === 'Enter' && sendFollowUpMessage()}
                placeholder={needsCorrection ? "잘못 이해한 부분을 알려주세요..." : "궁금한 점을 물어보세요..."}
                className="flex-1 px-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-600"
                disabled={isLoading}
              />
              <button
                onClick={sendFollowUpMessage}
                disabled={isLoading || !inputMessage.trim()}
                className="px-6 py-3 bg-purple-600 text-white rounded-lg hover:bg-purple-700 disabled:bg-gray-300 disabled:cursor-not-allowed transition-colors"
              >
                전송
              </button>
            </div>
          )}
        </div>

        <button
          onClick={() => {
            setCurrentPage(1);
            setMessages([]);
            setInterpretation('');
            setQuestionCount(0);
            setIsComplete(false);
            setNeedsCorrection(false);
            setFinalInterpretation('');
            setDrawings({
              house: null,
              tree: null,
              person: null
            });
            if (context && canvasRef.current) {
              context.clearRect(0, 0, canvasRef.current.width, canvasRef.current.height);
            }
          }}
          className="mt-6 w-full py-3 bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300 transition-colors"
        >
          처음으로 돌아가기
        </button>
      </div>
    </div>
  );
};

export default HTPChatbot;